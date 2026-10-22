from datetime import timedelta
from decimal import Decimal

from django.core import mail
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Dentist, PatientProfile, User
from apps.billing.models import Invoice
from apps.billing.services import BillingService
from apps.catalog.models import BranchService, Service
from apps.locations.models import Branch, Chair, Province, Ward
from apps.organizations.models import Membership, Organization
from apps.scheduling.models import Appointment, AppointmentStatusHistory
from apps.scheduling.services import AppointmentService

from .models import Notification, NotificationDelivery
from .tasks import publish_due_appointment_reminders


class BillingNotificationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        province = Province.objects.create(code="79", name="HCM", full_name="Ho Chi Minh")
        ward = Ward.objects.create(code="00001", province=province, name="Ward", full_name="Ward")
        cls.organization = Organization.objects.create(name="Notify Org", slug="notify-org")
        cls.branch = Branch.objects.create(
            organization=cls.organization, code="N1", name="Notify Branch",
            province=province, ward=ward, address_line="Address", location="POINT(106.7 10.7)",
        )
        cls.admin = cls.user("notify-admin@example.com", "Admin")
        Membership.objects.create(user=cls.admin, organization=cls.organization, branch=cls.branch, role=Membership.Role.BRANCH_ADMIN)
        cls.patient_user = cls.user("notify-patient@example.com", "Sensitive Patient Name")
        cls.patient = PatientProfile.objects.create(user=cls.patient_user)
        Membership.objects.create(user=cls.patient_user, organization=cls.organization, role=Membership.Role.PATIENT)
        dentist_user = cls.user("notify-dentist@example.com", "Dentist")
        cls.dentist = Dentist.objects.create(user=dentist_user, organization=cls.organization)
        cls.service = Service.objects.create(
            organization=cls.organization, code="IMPLANT", name="Sensitive Implant Service",
            standard_duration_minutes=60, standard_price=Decimal("1000000"),
        )
        cls.branch_service = BranchService.objects.create(branch=cls.branch, service=cls.service, price=Decimal("1000000"))
        cls.chair = Chair.objects.create(branch=cls.branch, code="C1", name="Chair", resource_type=Chair.ResourceType.CHAIR)

    @classmethod
    def user(cls, email, name):
        return User.objects.create_user(
            email=email, password="StrongPassword!2026", full_name=name,
            email_verified_at=timezone.now(),
        )

    def setUp(self):
        mail.outbox.clear()
        starts = timezone.now() - timedelta(hours=2)
        self.appointment = Appointment.objects.create(
            public_code=f"APT-NOTIFY-{self._testMethodName[-12:]}",
            patient_profile=self.patient, branch=self.branch,
            branch_service=self.branch_service, dentist=self.dentist, chair=self.chair,
            service_name_snapshot=self.service.name,
            service_price_snapshot=Decimal("1000000"), duration_minutes=60,
            buffer_minutes=0, starts_at=starts, ends_at=starts + timedelta(minutes=60),
            occupied_until=starts + timedelta(minutes=60), status=Appointment.Status.COMPLETED,
            completed_at=timezone.now(),
        )
        self.invoice = BillingService.create_invoice(
            appointment_id=self.appointment.pk, actor_user=self.admin
        )

    def issue(self):
        with self.captureOnCommitCallbacks(execute=True):
            return BillingService.issue_invoice(invoice_id=self.invoice.pk, actor_user=self.admin)

    def test_invoice_issue_creates_web_notification_and_sanitized_email(self):
        invoice = self.issue()
        notification = Notification.objects.get(type=Notification.Type.INVOICE_ISSUED)
        email_delivery = notification.deliveries.get(channel=NotificationDelivery.Channel.EMAIL)

        self.assertEqual(notification.recipient, self.patient_user)
        self.assertEqual(notification.payload, {"invoice_id": invoice.pk, "status": Invoice.Status.ISSUED})
        self.assertEqual(email_delivery.status, NotificationDelivery.Status.SENT)
        self.assertEqual(len(mail.outbox), 1)
        self.assertNotIn(self.patient_user.full_name, mail.outbox[0].body)
        self.assertNotIn(self.service.name, mail.outbox[0].body)
        self.assertNotIn(invoice.invoice_number, mail.outbox[0].body)
        self.assertNotIn("1000000", mail.outbox[0].body)

    def test_payment_notification_is_idempotent(self):
        invoice = self.issue()
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            payment, created = BillingService.post_payment(
                invoice_id=invoice.pk, method="CASH", amount=invoice.total,
                idempotency_key="notify-payment-idempotency", actor_user=self.admin,
            )
        with self.captureOnCommitCallbacks(execute=True):
            repeated, repeated_created = BillingService.post_payment(
                invoice_id=invoice.pk, method="CASH", amount=invoice.total,
                idempotency_key="notify-payment-idempotency", actor_user=self.admin,
            )

        self.assertTrue(created)
        self.assertFalse(repeated_created)
        self.assertEqual(payment.pk, repeated.pk)
        self.assertEqual(Notification.objects.filter(type=Notification.Type.INVOICE_PAID).count(), 1)
        self.assertEqual(len(mail.outbox), 1)

    def test_notification_api_is_owner_scoped_and_marks_read(self):
        self.issue()
        notification = Notification.objects.get()
        self.client.force_authenticate(self.patient_user)
        listed = self.client.get(reverse("notifications:list"), {"unread": "true"})
        read = self.client.post(reverse("notifications:read", kwargs={"notification_id": notification.pk}))
        empty = self.client.get(reverse("notifications:list"), {"unread": "true"})

        stranger = self.user("notify-stranger@example.com", "Stranger")
        self.client.force_authenticate(stranger)
        hidden = self.client.post(reverse("notifications:read", kwargs={"notification_id": notification.pk}))

        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(listed.data["meta"]["count"], 1)
        self.assertEqual(read.status_code, status.HTTP_200_OK)
        self.assertEqual(empty.data["meta"]["count"], 0)
        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)


class AppointmentWebNotificationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        province = Province.objects.create(code="79", name="HCM", full_name="Ho Chi Minh")
        ward = Ward.objects.create(code="00001", province=province, name="Ward", full_name="Ward")
        cls.organization = Organization.objects.create(name="Appointment Notify", slug="appointment-notify")
        cls.branch = Branch.objects.create(
            organization=cls.organization, code="AN1", name="Appointment Notify Branch",
            province=province, ward=ward, address_line="Address", location="POINT(106.7 10.7)",
        )
        cls.admin = BillingNotificationTests.user("appointment-admin@example.com", "Admin")
        Membership.objects.create(
            user=cls.admin, organization=cls.organization, branch=cls.branch,
            role=Membership.Role.BRANCH_ADMIN,
        )
        cls.patient_user = BillingNotificationTests.user("appointment-patient@example.com", "Patient")
        cls.patient = PatientProfile.objects.create(user=cls.patient_user)
        Membership.objects.create(
            user=cls.patient_user, organization=cls.organization, role=Membership.Role.PATIENT,
        )
        dentist_user = BillingNotificationTests.user("appointment-dentist@example.com", "Dentist")
        cls.dentist = Dentist.objects.create(user=dentist_user, organization=cls.organization)
        cls.service = Service.objects.create(
            organization=cls.organization, code="CLEAN", name="Cleaning",
            standard_duration_minutes=60, standard_price=Decimal("500000"),
        )
        cls.branch_service = BranchService.objects.create(
            branch=cls.branch, service=cls.service, price=Decimal("500000")
        )
        cls.chair = Chair.objects.create(
            branch=cls.branch, code="C1", name="Chair", resource_type=Chair.ResourceType.CHAIR
        )

    def appointment(self, code, *, starts_at, appointment_status):
        ends_at = starts_at + timedelta(hours=1)
        extra = {}
        if appointment_status == Appointment.Status.HELD:
            extra = {
                "held_at": timezone.now(),
                "expires_at": timezone.now() + timedelta(minutes=10),
            }
        elif appointment_status == Appointment.Status.CONFIRMED:
            extra["confirmed_at"] = timezone.now()
        elif appointment_status == Appointment.Status.CANCELLED:
            extra = {
                "cancelled_at": timezone.now(),
                "cancelled_by": self.admin,
                "cancel_reason": "Cancelled",
            }
        return Appointment.objects.create(
            public_code=code, patient_profile=self.patient, branch=self.branch,
            branch_service=self.branch_service, dentist=self.dentist, chair=self.chair,
            service_name_snapshot=self.service.name, service_price_snapshot=Decimal("500000"),
            duration_minutes=60, buffer_minutes=0, starts_at=starts_at,
            ends_at=ends_at, occupied_until=ends_at, status=appointment_status, **extra,
        )

    def assert_web_only(self, notification):
        self.assertEqual(
            list(notification.deliveries.values_list("channel", flat=True)),
            [NotificationDelivery.Channel.IN_APP],
        )
        self.assertEqual(notification.deliveries.get().status, NotificationDelivery.Status.SENT)

    def test_booking_and_manual_confirmation_create_web_only_notifications(self):
        held = self.appointment(
            "APT-WEB-BOOKED", starts_at=timezone.now() + timedelta(hours=30),
            appointment_status=Appointment.Status.HELD,
        )
        pending = self.appointment(
            "APT-WEB-CONFIRMED", starts_at=timezone.now() + timedelta(hours=32),
            appointment_status=Appointment.Status.PENDING,
        )

        AppointmentService.confirm_hold(
            appointment_id=held.pk, patient_user=self.patient_user
        )
        AppointmentService.transition_status(
            appointment_id=pending.pk,
            to_status=Appointment.Status.CONFIRMED,
            actor_type=AppointmentStatusHistory.ActorType.BRANCH_ADMIN,
            actor_user=self.admin,
        )

        booked = Notification.objects.get(type=Notification.Type.APPOINTMENT_BOOKED)
        confirmed = Notification.objects.get(type=Notification.Type.APPOINTMENT_CONFIRMED)
        self.assert_web_only(booked)
        self.assert_web_only(confirmed)

    def test_reminders_are_web_only_and_idempotent(self):
        now = timezone.now()
        tomorrow = self.appointment(
            "APT-WEB-24H", starts_at=now + timedelta(hours=23),
            appointment_status=Appointment.Status.CONFIRMED,
        )
        soon = self.appointment(
            "APT-WEB-2H", starts_at=now + timedelta(minutes=90),
            appointment_status=Appointment.Status.CONFIRMED,
        )
        self.appointment(
            "APT-WEB-CANCELLED", starts_at=now + timedelta(hours=10),
            appointment_status=Appointment.Status.CANCELLED,
        )

        first = publish_due_appointment_reminders(now=now)
        second = publish_due_appointment_reminders(now=now)

        self.assertEqual(first, 2)
        self.assertEqual(second, 0)
        reminder_24h = Notification.objects.get(
            type=Notification.Type.APPOINTMENT_REMINDER_24H,
            resource_id=str(tomorrow.pk),
        )
        reminder_2h = Notification.objects.get(
            type=Notification.Type.APPOINTMENT_REMINDER_2H,
            resource_id=str(soon.pk),
        )
        self.assert_web_only(reminder_24h)
        self.assert_web_only(reminder_2h)
        self.assertEqual(
            Notification.objects.filter(type__startswith="APPOINTMENT_REMINDER").count(), 2
        )
