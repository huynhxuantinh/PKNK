from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from payos import WebhookError
from django.db import DatabaseError, transaction
from django.urls import reverse
from django.utils import timezone
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Dentist, PatientProfile, User
from apps.audit.models import AuditEvent
from apps.catalog.models import BranchService, Service
from apps.locations.models import Branch, Chair, Province, Ward
from apps.organizations.models import Membership, Organization
from apps.scheduling.models import Appointment

from .models import Invoice, InvoiceLine, Payment, PayosTransaction
from .services import BillingService
from .tasks import reconcile_pending_payos_transactions


@override_settings(
    PAYOS_CLIENT_ID="test-client",
    PAYOS_API_KEY="test-api-key",
    PAYOS_CHECKSUM_KEY="test-checksum-key",
)
class CounterBillingTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        province = Province.objects.create(code="79", name="HCM", full_name="Ho Chi Minh")
        ward = Ward.objects.create(code="00001", province=province, name="Ward", full_name="Ward")
        cls.organization = Organization.objects.create(name="Billing Org", slug="billing-org")
        cls.branch = Branch.objects.create(
            organization=cls.organization, code="B1", name="Branch 1",
            province=province, ward=ward, address_line="Address", location="POINT(106.7 10.7)",
        )
        cls.other_branch = Branch.objects.create(
            organization=cls.organization, code="B2", name="Branch 2",
            province=province, ward=ward, address_line="Address 2", location="POINT(106.8 10.8)",
        )
        cls.admin = cls.user("billing-admin@example.com", "Branch Admin")
        Membership.objects.create(user=cls.admin, organization=cls.organization, branch=cls.branch, role=Membership.Role.BRANCH_ADMIN)
        cls.patient_user = cls.user("billing-patient@example.com", "Patient")
        cls.patient = PatientProfile.objects.create(user=cls.patient_user)
        Membership.objects.create(user=cls.patient_user, organization=cls.organization, role=Membership.Role.PATIENT)
        dentist_user = cls.user("billing-dentist@example.com", "Dentist")
        cls.dentist = Dentist.objects.create(user=dentist_user, organization=cls.organization)
        cls.service = Service.objects.create(
            organization=cls.organization, code="CLEAN", name="Cleaning",
            standard_duration_minutes=30, standard_price=Decimal("500000"),
        )
        cls.branch_service = BranchService.objects.create(branch=cls.branch, service=cls.service, price=Decimal("500000"))
        cls.chair = Chair.objects.create(branch=cls.branch, code="C1", name="Chair", resource_type=Chair.ResourceType.CHAIR)

    @classmethod
    def user(cls, email, name):
        return User.objects.create_user(
            email=email, password="StrongPassword!2026", full_name=name,
            email_verified_at=timezone.now(),
        )

    def appointment(self, code="APT-BILLING"):
        starts = timezone.now() - timedelta(hours=2)
        return Appointment.objects.create(
            public_code=code, patient_profile=self.patient, branch=self.branch,
            branch_service=self.branch_service, dentist=self.dentist, chair=self.chair,
            service_name_snapshot=self.service.name,
            service_price_snapshot=Decimal("500000"), duration_minutes=30,
            buffer_minutes=0, starts_at=starts, ends_at=starts + timedelta(minutes=30),
            occupied_until=starts + timedelta(minutes=30), status=Appointment.Status.COMPLETED,
            completed_at=timezone.now(),
        )

    def create_invoice(self, appointment):
        self.client.force_authenticate(self.admin)
        return self.client.post(
            reverse("management:branch-invoices", kwargs={"branch_id": self.branch.pk}),
            {"appointment_code": appointment.public_code}, format="json",
        )

    def issued_invoice(self, code="APT-PAYOS"):
        created = self.create_invoice(self.appointment(code))
        invoice_id = created.data["data"]["id_invoice"]
        issued = self.client.post(
            reverse("management:invoice-issue", kwargs={"invoice_id": invoice_id})
        )
        self.assertEqual(issued.status_code, status.HTTP_200_OK)
        return Invoice.objects.get(pk=invoice_id)

    def test_full_counter_flow_and_payment_void_reconciliation(self):
        created = self.create_invoice(self.appointment())
        invoice_id = created.data["data"]["id_invoice"]
        issued = self.client.post(reverse("management:invoice-issue", kwargs={"invoice_id": invoice_id}))
        paid = self.client.post(
            reverse("management:invoice-payments", kwargs={"invoice_id": invoice_id}),
            {"method": "CASH", "amount": "500000", "idempotency_key": "billing-payment-001"},
            format="json",
        )
        repeated = self.client.post(
            reverse("management:invoice-payments", kwargs={"invoice_id": invoice_id}),
            {"method": "CASH", "amount": "500000", "idempotency_key": "billing-payment-001"},
            format="json",
        )
        payment_id = paid.data["data"]["id_payment"]
        voided = self.client.post(
            reverse("management:payment-void", kwargs={"payment_id": payment_id}),
            {"reason": "Ghi nhận nhầm phương thức"}, format="json",
        )
        invoice = Invoice.objects.get(pk=invoice_id)

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(issued.status_code, status.HTTP_200_OK)
        self.assertEqual(paid.status_code, status.HTTP_201_CREATED)
        self.assertEqual(repeated.status_code, status.HTTP_200_OK)
        self.assertEqual(voided.status_code, status.HTTP_200_OK)
        self.assertEqual(Payment.objects.count(), 1)
        self.assertEqual(invoice.status, Invoice.Status.ISSUED)
        self.assertIsNone(invoice.paid_at)

    def test_requires_completed_appointment_and_exact_payment(self):
        appointment = self.appointment("APT-NOT-COMPLETE")
        appointment.status = Appointment.Status.CONFIRMED
        appointment.completed_at = None
        appointment.save(update_fields=["status", "completed_at"])
        rejected_invoice = self.create_invoice(appointment)
        appointment.status = Appointment.Status.COMPLETED
        appointment.completed_at = timezone.now()
        appointment.save(update_fields=["status", "completed_at"])
        created = self.create_invoice(appointment)
        invoice_id = created.data["data"]["id_invoice"]
        self.client.post(reverse("management:invoice-issue", kwargs={"invoice_id": invoice_id}))
        rejected_payment = self.client.post(
            reverse("management:invoice-payments", kwargs={"invoice_id": invoice_id}),
            {"method": "CARD", "amount": "400000", "idempotency_key": "billing-payment-002"}, format="json",
        )

        self.assertEqual(rejected_invoice.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(rejected_payment.status_code, status.HTTP_409_CONFLICT)
        self.assertFalse(Payment.objects.exists())

    def test_branch_scope_and_patient_read_only_scope(self):
        created = self.create_invoice(self.appointment())
        invoice_id = created.data["data"]["id_invoice"]
        self.client.post(reverse("management:invoice-issue", kwargs={"invoice_id": invoice_id}))
        cross = self.client.get(reverse("management:branch-invoices", kwargs={"branch_id": self.other_branch.pk}))
        self.client.force_authenticate(self.patient_user)
        own = self.client.get(reverse("patients:invoice-detail", kwargs={"invoice_id": invoice_id}))
        invoice_list = self.client.get(reverse("patients:invoices"), {"page": 1, "page_size": 1})
        stranger = self.user("billing-stranger@example.com", "Stranger")
        PatientProfile.objects.create(user=stranger)
        self.client.force_authenticate(stranger)
        hidden = self.client.get(reverse("patients:invoice-detail", kwargs={"invoice_id": invoice_id}))

        self.assertEqual(cross.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(own.status_code, status.HTTP_200_OK)
        self.assertNotIn("patient_profile_id", own.data["data"])
        self.assertNotIn("replacement_for_id", own.data["data"])
        self.assertNotIn("void_reason", own.data["data"])
        self.assertEqual(invoice_list.status_code, status.HTTP_200_OK)
        self.assertEqual(invoice_list.data["meta"], {"count": 1, "page": 1, "page_size": 1, "total_pages": 1})
        self.assertEqual(len(invoice_list.data["data"]), 1)
        self.assertTrue(
            AuditEvent.objects.filter(
                actor_user=self.patient_user,
                action="PATIENT_INVOICE_LIST_VIEWED",
            ).exists()
        )
        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)

    def test_management_invoice_list_is_paginated(self):
        for index in range(3):
            created = self.create_invoice(self.appointment(f"APT-PAGE-{index}"))
            self.assertEqual(created.status_code, status.HTTP_201_CREATED)

        response = self.client.get(
            reverse("management:branch-invoices", kwargs={"branch_id": self.branch.pk}),
            {"limit": 1, "offset": 1},
        )
        invalid = self.client.get(
            reverse("management:branch-invoices", kwargs={"branch_id": self.branch.pk}),
            {"limit": 101},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["meta"], {"count": 3, "limit": 1, "offset": 1})
        self.assertEqual(len(response.data["data"]), 1)
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)

    def test_issued_invoice_line_and_posted_payment_are_database_immutable(self):
        created = self.create_invoice(self.appointment())
        invoice_id = created.data["data"]["id_invoice"]
        self.client.post(reverse("management:invoice-issue", kwargs={"invoice_id": invoice_id}))
        self.client.post(
            reverse("management:invoice-payments", kwargs={"invoice_id": invoice_id}),
            {"method": "BANK_TRANSFER", "amount": "500000", "idempotency_key": "billing-payment-003"}, format="json",
        )
        line = InvoiceLine.objects.get(invoice_id=invoice_id)
        payment = Payment.objects.get(invoice_id=invoice_id)
        with self.assertRaises(DatabaseError), transaction.atomic():
            line.description = "Tampered"
            line.save(update_fields=["description"])
        with self.assertRaises(DatabaseError), transaction.atomic():
            payment.amount = Decimal("1")
            payment.save(update_fields=["amount"])

    def test_void_invoice_then_create_linked_replacement(self):
        appointment = self.appointment()
        created = self.create_invoice(appointment)
        invoice_id = created.data["data"]["id_invoice"]
        voided = self.client.post(
            reverse("management:invoice-void", kwargs={"invoice_id": invoice_id}),
            {"reason": "Sai nội dung hóa đơn"}, format="json",
        )
        replacement = self.client.post(
            reverse("management:branch-invoices", kwargs={"branch_id": self.branch.pk}),
            {"appointment_code": appointment.public_code, "replacement_for_id": invoice_id}, format="json",
        )

        self.assertEqual(voided.status_code, status.HTTP_200_OK)
        self.assertEqual(replacement.status_code, status.HTTP_201_CREATED)
        self.assertEqual(replacement.data["data"]["replacement_for_id"], invoice_id)

    def test_payos_transaction_statuses_are_explicit(self):
        self.assertEqual(
            set(PayosTransaction.Status.values),
            {"PENDING", "SUCCEEDED", "CANCELLED", "NEEDS_REVIEW"},
        )

    @patch("apps.billing.payos_service.PayOS")
    def test_patient_can_create_and_reuse_fresh_payos_checkout(self, payos_class):
        invoice = self.issued_invoice()
        payos_class.return_value.payment_requests.create.return_value = SimpleNamespace(
            checkout_url="https://pay.payos.vn/web/test",
            payment_link_id="link-1",
        )
        self.client.force_authenticate(self.patient_user)
        url = reverse("patients:invoice-payos", kwargs={"invoice_id": invoice.pk})

        first = self.client.post(url)
        second = self.client.post(url)

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["data"]["checkout_url"], "https://pay.payos.vn/web/test")
        self.assertEqual(PayosTransaction.objects.filter(invoice=invoice).count(), 1)
        payos_class.return_value.payment_requests.create.assert_called_once()

    def test_payos_checkout_hides_other_patient_invoice_and_rejects_staff(self):
        invoice = self.issued_invoice("APT-PAYOS-SCOPE")
        stranger = self.user("payos-stranger@example.com", "Stranger")
        PatientProfile.objects.create(user=stranger)
        Membership.objects.create(
            user=stranger, organization=self.organization, role=Membership.Role.PATIENT
        )
        url = reverse("patients:invoice-payos", kwargs={"invoice_id": invoice.pk})

        self.client.force_authenticate(stranger)
        hidden = self.client.post(url)
        self.client.force_authenticate(self.admin)
        forbidden = self.client.post(url)

        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)

    @patch("apps.billing.payos_service.PayOS")
    def test_invalid_payos_webhook_has_no_side_effect(self, payos_class):
        invoice = self.issued_invoice("APT-PAYOS-BAD-SIGNATURE")
        payos_transaction = PayosTransaction.objects.create(
            invoice=invoice, initiated_by=self.patient_user, amount=500000
        )
        payos_class.return_value.webhooks.verify.side_effect = WebhookError("bad signature")
        self.client.force_authenticate(None)

        response = self.client.post(reverse("payos-webhook"), {"data": {}}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Payment.objects.exists())
        self.assertEqual(invoice.payos_transactions.get().status, PayosTransaction.Status.PENDING)

    @patch("apps.billing.payos_service.PayOS")
    def test_duplicate_payos_webhook_posts_exactly_one_payment(self, payos_class):
        invoice = self.issued_invoice("APT-PAYOS-DUPLICATE")
        payos_transaction = PayosTransaction.objects.create(
            invoice=invoice, initiated_by=self.patient_user, amount=500000
        )
        payos_class.return_value.webhooks.verify.return_value = SimpleNamespace(
            order_code=payos_transaction.order_code,
            amount=500000,
            code="00",
            reference="PAYOS-REFERENCE",
        )
        self.client.force_authenticate(None)

        first = self.client.post(reverse("payos-webhook"), {"data": {}}, format="json")
        second = self.client.post(reverse("payos-webhook"), {"data": {}}, format="json")

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(Payment.objects.filter(invoice=invoice).count(), 1)
        payos_transaction.refresh_from_db()
        self.assertEqual(payos_transaction.status, PayosTransaction.Status.SUCCEEDED)

    @patch("apps.billing.payos_service.PayOS")
    def test_verified_unsuccessful_payos_webhook_does_not_post_payment(self, payos_class):
        invoice = self.issued_invoice("APT-PAYOS-NOT-SUCCESS")
        payos_transaction = PayosTransaction.objects.create(
            invoice=invoice, initiated_by=self.patient_user, amount=500000
        )
        payos_class.return_value.webhooks.verify.return_value = SimpleNamespace(
            order_code=payos_transaction.order_code,
            amount=500000,
            code="01",
            desc="Payment failed",
            reference="FAILED-PAYOS",
        )
        self.client.force_authenticate(None)

        response = self.client.post(
            reverse("payos-webhook"), {"data": {}}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["result"], "IGNORED_NOT_SUCCESSFUL")
        self.assertFalse(Payment.objects.filter(invoice=invoice).exists())
        invoice.refresh_from_db()
        payos_transaction.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.ISSUED)
        self.assertEqual(payos_transaction.status, PayosTransaction.Status.PENDING)

    @patch("apps.billing.payos_service.PayOS")
    def test_payos_amount_mismatch_requires_review(self, payos_class):
        invoice = self.issued_invoice("APT-PAYOS-MISMATCH")
        payos_transaction = PayosTransaction.objects.create(
            invoice=invoice, initiated_by=self.patient_user, amount=500000
        )
        payos_class.return_value.webhooks.verify.return_value = SimpleNamespace(
            order_code=payos_transaction.order_code,
            amount=499000,
            code="00",
            reference="WRONG-AMOUNT",
        )
        self.client.force_authenticate(None)

        response = self.client.post(reverse("payos-webhook"), {"data": {}}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payos_transaction.refresh_from_db()
        self.assertEqual(payos_transaction.status, PayosTransaction.Status.NEEDS_REVIEW)
        self.assertFalse(Payment.objects.filter(invoice=invoice).exists())
        self.assertTrue(AuditEvent.objects.filter(action="PAYOS_PAYMENT_NEEDS_REVIEW").exists())

    @patch("apps.billing.payos_service.PayOS")
    def test_webhook_for_non_issued_invoice_requires_review(self, payos_class):
        invoice = self.issued_invoice("APT-PAYOS-PAID")
        payos_transaction = PayosTransaction.objects.create(
            invoice=invoice, initiated_by=self.patient_user, amount=500000
        )
        BillingService.post_payment(
            invoice_id=invoice.pk,
            method=Payment.Method.CASH,
            amount=invoice.total,
            idempotency_key="counter-before-payos",
            actor_user=self.admin,
        )
        payos_class.return_value.webhooks.verify.return_value = SimpleNamespace(
            order_code=payos_transaction.order_code,
            amount=500000,
            code="00",
            reference="LATE-PAYOS",
        )
        self.client.force_authenticate(None)

        response = self.client.post(reverse("payos-webhook"), {"data": {}}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payos_transaction.refresh_from_db()
        self.assertEqual(payos_transaction.status, PayosTransaction.Status.NEEDS_REVIEW)

    def test_payos_payment_cannot_be_voided_as_if_it_were_a_refund(self):
        invoice = self.issued_invoice("APT-PAYOS-NO-VOID")
        payment, _ = BillingService.post_payment(
            invoice_id=invoice.pk,
            method=Payment.Method.BANK_TRANSFER,
            amount=invoice.total,
            idempotency_key="payos:12345678",
            actor_user=self.patient_user,
            external_reference="PAYOS-REFUND-SEPARATELY",
        )
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            reverse("management:payment-void", kwargs={"payment_id": payment.pk}),
            {"reason": "Thử hủy payment payOS"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("hoàn tiền", response.data["message"].lower())

    @override_settings(PAYOS_CLIENT_ID="", PAYOS_API_KEY="", PAYOS_CHECKSUM_KEY="")
    def test_reconciliation_skips_cleanly_when_payos_is_not_configured(self):
        invoice = self.issued_invoice("APT-PAYOS-NO-CONFIG")
        payos_transaction = PayosTransaction.objects.create(
            invoice=invoice,
            initiated_by=self.patient_user,
            amount=500000,
            checkout_url="https://pay.payos.vn/web/pending",
        )
        PayosTransaction.objects.filter(pk=payos_transaction.pk).update(
            created_at=timezone.now() - timedelta(minutes=10)
        )

        self.assertEqual(reconcile_pending_payos_transactions(), 0)
