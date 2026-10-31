from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Dentist, PatientProfile, User
from apps.audit.models import AuditEvent
from apps.catalog.models import BranchService, DentistService, Service
from apps.locations.models import Branch, BranchOpeningHour, Chair, Province, Ward
from apps.notifications.models import Notification, NotificationDelivery
from apps.organizations.models import Membership, Organization

from .models import Appointment, AppointmentStatusHistory, WorkShift


class PatientAppointmentApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        province = Province.objects.create(code="79", name="HCM", full_name="HCM")
        ward = Ward.objects.create(
            code="00001", province=province, name="Ward", full_name="Ward"
        )
        cls.organization = Organization.objects.create(
            name="Patient Appointment Org", slug="patient-appointment-org",
            cancellation_cutoff_minutes=1440,
        )
        cls.branch = Branch.objects.create(
            organization=cls.organization, code="A", name="Branch A",
            province=province, ward=ward, address_line="Address A",
            location="POINT(106.7 10.7)",
        )
        cls.patient_user = cls.make_user("patient-appointments@example.com", "Patient")
        cls.patient = PatientProfile.objects.create(user=cls.patient_user)
        Membership.objects.create(
            user=cls.patient_user, organization=cls.organization,
            role=Membership.Role.PATIENT,
        )
        cls.other_user = cls.make_user("other-appointments@example.com", "Other")
        cls.other_patient = PatientProfile.objects.create(user=cls.other_user)
        Membership.objects.create(
            user=cls.other_user, organization=cls.organization,
            role=Membership.Role.PATIENT,
        )
        cls.dentist_user = cls.make_user("dentist-appointments@example.com", "Dentist")
        cls.dentist = Dentist.objects.create(
            user=cls.dentist_user, organization=cls.organization
        )
        Membership.objects.create(
            user=cls.dentist_user, organization=cls.organization, branch=cls.branch,
            role=Membership.Role.DENTIST,
        )
        cls.service = Service.objects.create(
            organization=cls.organization, code="CLEAN", name="Cleaning",
            standard_duration_minutes=30, buffer_minutes=10,
            standard_price=Decimal("500000"),
        )
        DentistService.objects.create(dentist=cls.dentist, service=cls.service)
        cls.branch_service = BranchService.objects.create(
            branch=cls.branch, service=cls.service, price=Decimal("500000")
        )
        cls.chair = Chair.objects.create(
            branch=cls.branch, code="C1", name="Chair 1",
            resource_type=Chair.ResourceType.CHAIR,
        )
        cls.target_date = timezone.localdate() + timedelta(days=7)
        BranchOpeningHour.objects.create(
            branch=cls.branch, weekday=cls.target_date.isoweekday(),
            open_time=time(8), close_time=time(17),
        )
        WorkShift.objects.create(
            dentist=cls.dentist, branch=cls.branch,
            weekday=cls.target_date.isoweekday(), start_time=time(8), end_time=time(17),
            valid_from=cls.target_date,
        )

    @classmethod
    def make_user(cls, email, full_name):
        return User.objects.create_user(
            email=email, password="StrongPassword!2026", full_name=full_name,
            email_verified_at=timezone.now(),
        )

    @classmethod
    def at(cls, hour, minute=0):
        return datetime.combine(
            cls.target_date, time(hour, minute),
            tzinfo=ZoneInfo(cls.organization.timezone),
        )

    def appointment(
        self, code, *, patient=None, appointment_status=Appointment.Status.CONFIRMED,
        starts_at=None,
    ):
        patient = patient or self.patient
        starts_at = starts_at or self.at(9)
        ends_at = starts_at + timedelta(minutes=30)
        extra = {}
        if appointment_status == Appointment.Status.HELD:
            extra = {
                "held_at": timezone.now(),
                "expires_at": timezone.now() + timedelta(minutes=10),
            }
        elif appointment_status == Appointment.Status.COMPLETED:
            extra["completed_at"] = ends_at
        elif appointment_status == Appointment.Status.CANCELLED:
            extra = {
                "cancelled_at": starts_at - timedelta(days=1),
                "cancelled_by": patient.user,
                "cancel_reason": "Cancelled",
            }
        return Appointment.objects.create(
            public_code=code, patient_profile=patient, branch=self.branch,
            branch_service=self.branch_service, dentist=self.dentist, chair=self.chair,
            service_name_snapshot=self.service.name,
            service_price_snapshot=self.branch_service.price,
            duration_minutes=30, buffer_minutes=10, starts_at=starts_at,
            ends_at=ends_at, occupied_until=ends_at + timedelta(minutes=10),
            status=appointment_status, **extra,
        )

    def test_list_separates_upcoming_and_history_and_hides_holds(self):
        upcoming = self.appointment("PATIENT-UPCOMING", starts_at=self.at(9))
        self.appointment(
            "PATIENT-STALE-UPCOMING",
            starts_at=timezone.now() - timedelta(days=1),
        )
        checked_in = self.appointment(
            "PATIENT-CHECKED-IN",
            appointment_status=Appointment.Status.CHECKED_IN,
            starts_at=timezone.now() - timedelta(hours=2),
        )
        in_progress = self.appointment(
            "PATIENT-IN-PROGRESS",
            appointment_status=Appointment.Status.IN_PROGRESS,
            starts_at=timezone.now() - timedelta(hours=1),
        )
        completed = self.appointment(
            "PATIENT-HISTORY", appointment_status=Appointment.Status.COMPLETED,
            starts_at=self.at(8) - timedelta(days=14),
        )
        self.appointment(
            "PATIENT-HOLD", appointment_status=Appointment.Status.HELD,
            starts_at=self.at(11),
        )
        self.appointment(
            "OTHER-UPCOMING", patient=self.other_patient, starts_at=self.at(10),
        )
        self.client.force_authenticate(self.patient_user)
        url = reverse("patients:appointments")

        upcoming_response = self.client.get(url, {"scope": "UPCOMING"})
        history_response = self.client.get(url, {"scope": "HISTORY"})

        self.assertEqual(upcoming_response.status_code, status.HTTP_200_OK)
        self.assertEqual(upcoming_response.data["meta"]["count"], 4)
        self.assertEqual(
            {item["public_code"] for item in upcoming_response.data["data"]},
            {
                upcoming.public_code,
                "PATIENT-STALE-UPCOMING",
                checked_in.public_code,
                in_progress.public_code,
            },
        )
        self.assertEqual(history_response.data["meta"]["count"], 1)
        self.assertEqual(history_response.data["data"][0]["public_code"], completed.public_code)

    def test_upcoming_appointments_are_paginated_before_overdue_unprocessed_ones(self):
        future = self.appointment("PATIENT-FUTURE-FIRST", starts_at=self.at(9))
        self.appointment(
            "PATIENT-OVERDUE-ONE",
            starts_at=timezone.now() - timedelta(days=3),
        )
        self.appointment(
            "PATIENT-OVERDUE-TWO",
            starts_at=timezone.now() - timedelta(days=2),
        )
        self.client.force_authenticate(self.patient_user)

        response = self.client.get(
            reverse("patients:appointments"),
            {"scope": "UPCOMING", "page": 1, "page_size": 1},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["meta"]["count"], 3)
        self.assertEqual(response.data["data"][0]["public_code"], future.public_code)

    def test_detail_is_owner_scoped_and_audited(self):
        own = self.appointment("PATIENT-DETAIL", starts_at=self.at(9))
        other = self.appointment(
            "OTHER-DETAIL", patient=self.other_patient, starts_at=self.at(10)
        )
        self.client.force_authenticate(self.patient_user)

        own_response = self.client.get(
            reverse("patients:appointment-detail", kwargs={"public_code": own.public_code})
        )
        other_response = self.client.get(
            reverse("patients:appointment-detail", kwargs={"public_code": other.public_code})
        )

        self.assertEqual(own_response.status_code, status.HTTP_200_OK)
        self.assertTrue(own_response.data["data"]["can_cancel"])
        self.assertEqual(other_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(AuditEvent.objects.filter(
            action="PATIENT_APPOINTMENT_VIEWED", resource_id=str(own.pk)
        ).exists())

    def test_patient_can_cancel_own_appointment_before_cutoff(self):
        appointment = self.appointment("PATIENT-CANCEL", starts_at=self.at(9))
        self.client.force_authenticate(self.patient_user)

        response = self.client.post(
            reverse(
                "patients:appointment-cancel",
                kwargs={"public_code": appointment.public_code},
            ),
            {"reason": "Cannot attend"}, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        appointment.refresh_from_db()
        self.assertEqual(appointment.status, Appointment.Status.CANCELLED)
        history = appointment.status_histories.get()
        self.assertEqual(history.actor_type, AppointmentStatusHistory.ActorType.PATIENT)
        self.assertEqual(appointment.cancelled_by, self.patient_user)
        notification = Notification.objects.get(
            type=Notification.Type.APPOINTMENT_CANCELLED,
            resource_id=str(appointment.pk),
        )
        self.assertEqual(notification.recipient, self.patient_user)
        self.assertEqual(
            list(notification.deliveries.values_list("channel", flat=True)),
            [NotificationDelivery.Channel.IN_APP],
        )

    def test_patient_cannot_cancel_after_cutoff(self):
        appointment = self.appointment(
            "PATIENT-LATE-CANCEL", starts_at=timezone.now() + timedelta(hours=12)
        )
        self.client.force_authenticate(self.patient_user)

        response = self.client.post(
            reverse(
                "patients:appointment-cancel",
                kwargs={"public_code": appointment.public_code},
            ),
            {"reason": "Too late"}, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        appointment.refresh_from_db()
        self.assertEqual(appointment.status, Appointment.Status.CONFIRMED)

    def test_patient_can_reschedule_and_retry_idempotently(self):
        original = self.appointment("PATIENT-RESCHEDULE", starts_at=self.at(9))
        self.client.force_authenticate(self.patient_user)
        url = reverse(
            "patients:appointment-reschedule",
            kwargs={"public_code": original.public_code},
        )
        payload = {
            "starts_at": self.at(10).isoformat(),
            "reason": "Need another time",
            "idempotency_key": "patient-reschedule-001",
        }

        first = self.client.post(url, payload, format="json")
        second = self.client.post(url, payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["data"]["public_code"], second.data["data"]["public_code"])
        original.refresh_from_db()
        successor = Appointment.objects.get(rescheduled_from=original)
        self.assertEqual(original.status, Appointment.Status.CANCELLED)
        self.assertEqual(successor.patient_profile, self.patient)
        self.assertEqual(successor.starts_at, self.at(10))
        self.assertEqual(
            successor.status_histories.get().actor_type,
            AppointmentStatusHistory.ActorType.PATIENT,
        )
        notification = Notification.objects.get(
            type=Notification.Type.APPOINTMENT_RESCHEDULED,
            resource_id=str(successor.pk),
        )
        self.assertEqual(notification.recipient, self.patient_user)
        self.assertFalse(Notification.objects.filter(
            type=Notification.Type.APPOINTMENT_CANCELLED,
            resource_id=str(original.pk),
        ).exists())
        self.assertEqual(
            list(notification.deliveries.values_list("channel", flat=True)),
            [NotificationDelivery.Channel.IN_APP],
        )

    def test_reschedule_slots_exclude_the_patient_original_appointment(self):
        original = self.appointment(
            "PATIENT-RESCHEDULE-SLOTS",
            starts_at=self.at(9),
        )
        self.client.force_authenticate(self.patient_user)

        response = self.client.get(
            reverse(
                "patients:appointment-reschedule-slots",
                kwargs={"public_code": original.public_code},
            ),
            {"date": self.target_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        starts_at = {item["starts_at"] for item in response.data["data"]}
        self.assertIn(self.at(9), starts_at)

    def test_patient_cannot_reschedule_after_cutoff(self):
        original = self.appointment(
            "PATIENT-LATE-RESCHEDULE", starts_at=timezone.now() + timedelta(hours=12)
        )
        self.client.force_authenticate(self.patient_user)

        response = self.client.post(
            reverse(
                "patients:appointment-reschedule",
                kwargs={"public_code": original.public_code},
            ),
            {
                "starts_at": self.at(10).isoformat(),
                "reason": "Too late",
                "idempotency_key": "patient-late-reschedule",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(
            response.data["error"]["code"], "appointment_reschedule_conflict"
        )
        original.refresh_from_db()
        self.assertEqual(original.status, Appointment.Status.CONFIRMED)

    def test_staff_cannot_reschedule_patient_appointment(self):
        appointment = self.appointment(
            "STAFF-CANNOT-RESCHEDULE", starts_at=self.at(9)
        )
        self.client.force_authenticate(self.dentist_user)

        response = self.client.post(
            reverse(
                "patients:appointment-reschedule",
                kwargs={"public_code": appointment.public_code},
            ),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_patient_cannot_mutate_another_patients_appointment(self):
        other = self.appointment(
            "OTHER-MUTATION", patient=self.other_patient, starts_at=self.at(9)
        )
        self.client.force_authenticate(self.patient_user)

        cancel = self.client.post(
            reverse(
                "patients:appointment-cancel",
                kwargs={"public_code": other.public_code},
            ),
            {"reason": "Not mine"}, format="json",
        )
        reschedule = self.client.post(
            reverse(
                "patients:appointment-reschedule",
                kwargs={"public_code": other.public_code},
            ),
            {
                "starts_at": self.at(10).isoformat(),
                "reason": "Not mine",
                "idempotency_key": "other-patient-reschedule",
            },
            format="json",
        )

        self.assertEqual(cancel.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(reschedule.status_code, status.HTTP_404_NOT_FOUND)
