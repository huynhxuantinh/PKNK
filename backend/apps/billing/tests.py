from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from payos import WebhookError
from payos import PayOSError
from django.core.exceptions import ValidationError
from django.core.cache import cache
from django.db import DatabaseError, transaction
from django.urls import reverse
from django.utils import timezone
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Dentist, PatientProfile, User
from apps.audit.models import AuditEvent
from apps.catalog.models import BranchService, Service
from apps.clinical.models import ClinicalEncounter, ClinicalPerformedService
from apps.locations.models import Branch, Chair, Province, Ward
from apps.organizations.models import Membership, Organization
from apps.scheduling.models import Appointment

from .models import Invoice, InvoiceLine, Payment, PayosTransaction
from .payos_service import PayosCheckoutUnavailable, create_checkout
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

    def setUp(self):
        super().setUp()
        cache.clear()

    @classmethod
    def user(cls, email, name):
        return User.objects.create_user(
            email=email, password="StrongPassword!2026", full_name=name,
            email_verified_at=timezone.now(),
        )

    def appointment(
        self,
        code="APT-BILLING",
        *,
        service_rows=None,
        confirmed=True,
        legacy_billing_allowed=False,
        booking_price=Decimal("500000"),
    ):
        starts = timezone.now() - timedelta(hours=2)
        appointment = Appointment.objects.create(
            public_code=code, patient_profile=self.patient, branch=self.branch,
            branch_service=self.branch_service, dentist=self.dentist, chair=self.chair,
            service_name_snapshot=self.service.name,
            service_price_snapshot=booking_price, duration_minutes=30,
            buffer_minutes=0, starts_at=starts, ends_at=starts + timedelta(minutes=30),
            occupied_until=starts + timedelta(minutes=30), status=Appointment.Status.COMPLETED,
            completed_at=timezone.now(),
        )
        encounter = ClinicalEncounter.objects.create(
            appointment=appointment,
            performed_services_confirmed=confirmed,
            legacy_billing_allowed=legacy_billing_allowed,
            created_by=self.dentist.user,
        )
        if service_rows is None:
            service_rows = [(self.branch_service, self.service, Decimal("500000"), 1)]
        for branch_service, service, price, quantity in service_rows:
            ClinicalPerformedService.objects.create(
                encounter=encounter,
                branch_service=branch_service,
                service_code_snapshot=service.code,
                service_name_snapshot=service.name,
                unit_price_snapshot=price,
                quantity=quantity,
            )
        encounter.status = ClinicalEncounter.Status.FINALIZED
        encounter.finalized_by = self.dentist.user
        encounter.finalized_at = timezone.now()
        encounter.save(update_fields=["status", "finalized_by", "finalized_at"])
        return appointment

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

    def test_payos_order_code_uses_reserved_project_range(self):
        invoice = self.issued_invoice("APT-PAYOS-ORDER-RANGE")

        payos_transaction = PayosTransaction.objects.create(
            invoice=invoice,
            initiated_by=self.patient_user,
            amount=500000,
        )

        self.assertGreaterEqual(payos_transaction.order_code, 202610260000000)

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
        unacknowledged_void = self.client.post(
            reverse("management:payment-void", kwargs={"payment_id": payment_id}),
            {"reason": "Ghi nhận nhầm phương thức"},
            format="json",
        )
        voided = self.client.post(
            reverse("management:payment-void", kwargs={"payment_id": payment_id}),
            {
                "reason": "Ghi nhận nhầm phương thức",
                "cash_refund_confirmed": True,
            },
            format="json",
        )
        invoice = Invoice.objects.get(pk=invoice_id)

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(issued.status_code, status.HTTP_200_OK)
        self.assertEqual(paid.status_code, status.HTTP_201_CREATED)
        self.assertEqual(repeated.status_code, status.HTTP_200_OK)
        self.assertEqual(unacknowledged_void.status_code, status.HTTP_409_CONFLICT)
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
            {"method": "CASH", "amount": "400000", "idempotency_key": "billing-payment-002"}, format="json",
        )

        self.assertEqual(rejected_invoice.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(rejected_payment.status_code, status.HTTP_409_CONFLICT)
        self.assertFalse(Payment.objects.exists())

    def test_counter_payment_rejects_non_cash_methods(self):
        created = self.create_invoice(self.appointment("APT-MANUAL-CASH-ONLY"))
        invoice_id = created.data["data"]["id_invoice"]
        self.client.post(reverse("management:invoice-issue", kwargs={"invoice_id": invoice_id}))

        rejected = self.client.post(
            reverse("management:invoice-payments", kwargs={"invoice_id": invoice_id}),
            {"method": "BANK_TRANSFER", "amount": "500000", "idempotency_key": "billing-payment-cash-only"},
            format="json",
        )

        self.assertEqual(rejected.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Payment.objects.filter(invoice_id=invoice_id).exists())

    def test_draft_adjustment_requires_reason_and_branch_service(self):
        created = self.create_invoice(self.appointment("APT-DRAFT-REASON"))
        invoice_id = created.data["data"]["id_invoice"]

        missing_reason = self.client.patch(
            reverse("management:invoice-detail", kwargs={"invoice_id": invoice_id}),
            {"discount": "10000"},
            format="json",
        )
        updated = self.client.patch(
            reverse("management:invoice-detail", kwargs={"invoice_id": invoice_id}),
            {"discount": "10000", "adjustment_reason": "Ưu đãi chăm sóc định kỳ"},
            format="json",
        )

        self.assertEqual(missing_reason.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["data"]["discount"], "10000.00")
        self.assertTrue(AuditEvent.objects.filter(
            action="INVOICE_DRAFT_UPDATED",
            after_data__adjustment_reason="Ưu đãi chăm sóc định kỳ",
        ).exists())

    def test_dentist_cannot_adjust_or_issue_invoice(self):
        created = self.create_invoice(self.appointment("APT-DENTIST-NO-BILLING"))
        invoice_id = created.data["data"]["id_invoice"]
        Membership.objects.create(
            user=self.dentist.user,
            organization=self.organization,
            branch=self.branch,
            role=Membership.Role.DENTIST,
        )
        self.client.force_authenticate(self.dentist.user)

        adjustment = self.client.patch(
            reverse("management:invoice-detail", kwargs={"invoice_id": invoice_id}),
            {"discount": "10000", "adjustment_reason": "Không có quyền"},
            format="json",
        )
        issuance = self.client.post(
            reverse("management:invoice-issue", kwargs={"invoice_id": invoice_id}),
        )

        self.assertEqual(adjustment.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(issuance.status_code, status.HTTP_403_FORBIDDEN)

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

    def test_invoice_uses_confirmed_services_and_ready_queue(self):
        second_service = Service.objects.create(
            organization=self.organization,
            code="EXAM",
            name="Dental examination",
            standard_duration_minutes=20,
            standard_price=Decimal("150000"),
        )
        second_branch_service = BranchService.objects.create(
            branch=self.branch,
            service=second_service,
            price=Decimal("150000"),
        )
        appointment = self.appointment(
            "APT-ACTUAL-SERVICES",
            service_rows=[
                (self.branch_service, self.service, Decimal("500000"), 1),
                (second_branch_service, second_service, Decimal("150000"), 2),
            ],
        )
        self.client.force_authenticate(self.admin)

        queue = self.client.get(
            reverse("management:branch-invoice-ready-appointments", kwargs={"branch_id": self.branch.pk}),
            {
                "date_from": timezone.localdate().isoformat(),
                "date_to": timezone.localdate().isoformat(),
                "limit": 1,
                "offset": 0,
            },
        )
        created = self.create_invoice(appointment)

        self.assertEqual(queue.status_code, status.HTTP_200_OK)
        self.assertEqual(queue.data["meta"], {"count": 1, "limit": 1, "offset": 0})
        self.assertEqual(queue.data["data"][0]["appointment_code"], appointment.public_code)
        self.assertEqual(queue.data["data"][0]["estimated_total"], Decimal("800000.00"))
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.data["data"]["subtotal"], "800000.00")
        self.assertEqual(len(created.data["data"]["lines"]), 2)

    def test_invoice_rejects_completed_visit_without_confirmed_actual_services(self):
        appointment = self.appointment("APT-NO-ACTUAL-SERVICES", confirmed=False)

        response = self.create_invoice(appointment)

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("xác nhận dịch vụ", response.data["message"])

    def test_confirmed_no_charge_visit_is_not_invoiceable_or_in_ready_queue(self):
        appointment = self.appointment(
            "APT-NO-CHARGE",
            confirmed=True,
            service_rows=[],
        )
        self.client.force_authenticate(self.admin)

        queue = self.client.get(
            reverse("management:branch-invoice-ready-appointments", kwargs={"branch_id": self.branch.pk}),
        )
        response = self.create_invoice(appointment)

        self.assertEqual(queue.status_code, status.HTTP_200_OK)
        self.assertNotIn(appointment.public_code, [item["appointment_code"] for item in queue.data["data"]])
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("không có dịch vụ tính phí", response.data["message"])

    def test_zero_price_performed_or_legacy_visit_is_not_in_invoice_ready_queue(self):
        performed = self.appointment(
            "APT-ZERO-PERFORMED",
            confirmed=True,
            service_rows=[(self.branch_service, self.service, Decimal("0"), 1)],
        )
        legacy = self.appointment(
            "APT-ZERO-LEGACY",
            confirmed=False,
            service_rows=[],
            legacy_billing_allowed=True,
            booking_price=Decimal("0"),
        )
        self.client.force_authenticate(self.admin)

        queue = self.client.get(
            reverse("management:branch-invoice-ready-appointments", kwargs={"branch_id": self.branch.pk}),
        )
        performed_invoice = self.create_invoice(performed)
        legacy_invoice = self.create_invoice(legacy)

        self.assertEqual(queue.status_code, status.HTTP_200_OK)
        codes = [item["appointment_code"] for item in queue.data["data"]]
        self.assertNotIn(performed.public_code, codes)
        self.assertNotIn(legacy.public_code, codes)
        self.assertEqual(performed_invoice.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(legacy_invoice.status_code, status.HTTP_409_CONFLICT)

    def test_legacy_completed_visit_uses_booking_snapshot_without_creating_clinical_data(self):
        appointment = self.appointment(
            "APT-LEGACY-BILLING",
            confirmed=False,
            service_rows=[],
            legacy_billing_allowed=True,
        )
        encounter = appointment.clinical_encounter
        self.client.force_authenticate(self.admin)

        queue = self.client.get(
            reverse("management:branch-invoice-ready-appointments", kwargs={"branch_id": self.branch.pk}),
        )
        response = self.create_invoice(appointment)

        self.assertEqual(queue.status_code, status.HTTP_200_OK)
        item = next(item for item in queue.data["data"] if item["appointment_code"] == appointment.public_code)
        self.assertEqual(item["billing_basis"], "LEGACY_BOOKING_SNAPSHOT")
        self.assertEqual(item["performed_services"][0]["service_name"], self.service.name)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["data"]["lines"][0]["description"], f"{self.service.name} (dữ liệu lịch sử)")
        self.assertFalse(ClinicalPerformedService.objects.filter(encounter=encounter).exists())

    def test_issued_invoice_line_and_posted_payment_are_database_immutable(self):
        created = self.create_invoice(self.appointment())
        invoice_id = created.data["data"]["id_invoice"]
        self.client.post(reverse("management:invoice-issue", kwargs={"invoice_id": invoice_id}))
        self.client.post(
            reverse("management:invoice-payments", kwargs={"invoice_id": invoice_id}),
            {"method": "CASH", "amount": "500000", "idempotency_key": "billing-payment-003"}, format="json",
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

    @patch("apps.billing.payos_service.PayOS")
    def test_void_invoice_cancels_pending_payos_link_first(self, payos_class):
        invoice = self.issued_invoice("APT-VOID-PAYOS-LINK")
        payos_transaction = PayosTransaction.objects.create(
            invoice=invoice,
            initiated_by=self.patient_user,
            amount=500000,
            checkout_url="https://pay.payos.vn/web/to-cancel",
            payos_reference="to-cancel",
        )
        payos_class.return_value.payment_requests.cancel.return_value = SimpleNamespace(
            status="CANCELLED"
        )
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            reverse("management:invoice-void", kwargs={"invoice_id": invoice.pk}),
            {"reason": "Hóa đơn lập sai"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        invoice.refresh_from_db()
        payos_transaction.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.VOID)
        self.assertEqual(payos_transaction.status, PayosTransaction.Status.CANCELLED)
        payos_class.return_value.payment_requests.cancel.assert_called_once_with(
            payos_transaction.order_code,
            cancellation_reason="Invoice voided",
        )

    @patch("apps.billing.payos_service.PayOS")
    def test_void_invoice_is_blocked_when_payos_link_cannot_be_cancelled(self, payos_class):
        invoice = self.issued_invoice("APT-VOID-PAYOS-FAIL")
        payos_transaction = PayosTransaction.objects.create(
            invoice=invoice,
            initiated_by=self.patient_user,
            amount=500000,
            checkout_url="https://pay.payos.vn/web/cancel-fails",
        )
        payos_class.return_value.payment_requests.cancel.side_effect = PayOSError(
            "provider unavailable"
        )
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            reverse("management:invoice-void", kwargs={"invoice_id": invoice.pk}),
            {"reason": "Hóa đơn lập sai"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("link thanh toán payOS", response.data["message"])
        invoice.refresh_from_db()
        payos_transaction.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.ISSUED)
        self.assertEqual(payos_transaction.status, PayosTransaction.Status.PENDING)

    @patch("apps.billing.payos_service.PayOS")
    def test_void_invoice_accepts_already_cancelled_or_expired_payos_link(self, payos_class):
        payos_class.return_value.payment_requests.cancel.side_effect = PayOSError(
            "link cannot be cancelled"
        )
        payos_class.return_value.payment_requests.get.side_effect = [
            SimpleNamespace(status="CANCELLED"),
            SimpleNamespace(status="EXPIRED"),
        ]
        self.client.force_authenticate(self.admin)

        for index, remote_status in enumerate(("CANCELLED", "EXPIRED")):
            with self.subTest(remote_status=remote_status):
                invoice = self.issued_invoice(f"APT-VOID-PAYOS-{remote_status}-{index}")
                payos_transaction = PayosTransaction.objects.create(
                    invoice=invoice,
                    initiated_by=self.patient_user,
                    amount=500000,
                    checkout_url=f"https://pay.payos.vn/web/{remote_status.lower()}",
                )
                self.client.force_authenticate(self.admin)

                response = self.client.post(
                    reverse("management:invoice-void", kwargs={"invoice_id": invoice.pk}),
                    {"reason": "Hóa đơn lập sai"},
                    format="json",
                )

                self.assertEqual(response.status_code, status.HTTP_200_OK)
                invoice.refresh_from_db()
                payos_transaction.refresh_from_db()
                self.assertEqual(invoice.status, Invoice.Status.VOID)
                self.assertEqual(
                    payos_transaction.status, PayosTransaction.Status.CANCELLED
                )

        self.assertEqual(payos_class.return_value.payment_requests.get.call_count, 2)

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

    @patch("apps.billing.payos_service.PayOS")
    def test_expired_checkout_is_verified_and_cancelled_before_replacement(self, payos_class):
        invoice = self.issued_invoice("APT-PAYOS-REPLACE")
        previous = PayosTransaction.objects.create(
            invoice=invoice,
            initiated_by=self.patient_user,
            amount=500000,
            checkout_url="https://pay.payos.vn/web/old-link",
        )
        PayosTransaction.objects.filter(pk=previous.pk).update(
            created_at=timezone.now() - timedelta(minutes=16)
        )
        payos_class.return_value.payment_requests.get.return_value = SimpleNamespace(
            status="PENDING"
        )
        payos_class.return_value.payment_requests.cancel.return_value = SimpleNamespace(
            status="CANCELLED"
        )
        payos_class.return_value.payment_requests.create.return_value = SimpleNamespace(
            checkout_url="https://pay.payos.vn/web/new-link",
            payment_link_id="new-link",
        )

        replacement, created = create_checkout(invoice=invoice, user=self.patient_user)

        previous.refresh_from_db()
        self.assertTrue(created)
        self.assertNotEqual(replacement.pk, previous.pk)
        self.assertEqual(previous.status, PayosTransaction.Status.CANCELLED)
        payos_class.return_value.payment_requests.get.assert_called_once_with(
            previous.order_code
        )
        payos_class.return_value.payment_requests.cancel.assert_called_once_with(
            previous.order_code,
            cancellation_reason="Replacing expired payment link",
        )

    @patch("apps.billing.payos_service.PayOS")
    def test_replacement_is_blocked_when_previous_link_cannot_be_retired(self, payos_class):
        invoice = self.issued_invoice("APT-PAYOS-UNSAFE-REPLACE")
        previous = PayosTransaction.objects.create(
            invoice=invoice,
            initiated_by=self.patient_user,
            amount=500000,
            checkout_url="https://pay.payos.vn/web/old-link",
        )
        PayosTransaction.objects.filter(pk=previous.pk).update(
            created_at=timezone.now() - timedelta(minutes=16)
        )
        payos_class.return_value.payment_requests.get.return_value = SimpleNamespace(
            status="PENDING"
        )
        payos_class.return_value.payment_requests.cancel.return_value = SimpleNamespace(
            status="PENDING"
        )

        with self.assertRaises(PayosCheckoutUnavailable):
            create_checkout(invoice=invoice, user=self.patient_user)

        previous.refresh_from_db()
        self.assertEqual(previous.status, PayosTransaction.Status.PENDING)
        payos_class.return_value.payment_requests.create.assert_not_called()

    @patch("apps.billing.payos_service.PayOS")
    def test_create_checkout_rechecks_invoice_status_after_lock(self, payos_class):
        invoice = self.issued_invoice("APT-PAYOS-STALE-STATUS")
        BillingService.void_invoice(
            invoice_id=invoice.pk,
            reason="Hủy hóa đơn trước khi tạo link.",
            actor_user=self.admin,
        )
        payos_class.return_value.payment_requests.create.return_value = SimpleNamespace(
            checkout_url="https://pay.payos.vn/web/stale",
            payment_link_id="stale-link",
        )

        with self.assertRaisesMessage(
            ValidationError,
            "Hóa đơn không còn ở trạng thái chờ thanh toán.",
        ):
            create_checkout(invoice=invoice, user=self.patient_user)

        payos_class.return_value.payment_requests.create.assert_not_called()
        self.assertFalse(PayosTransaction.objects.filter(invoice=invoice).exists())

    @patch("apps.billing.patient_views.create_checkout")
    def test_checkout_state_conflict_returns_409(self, create_checkout_mock):
        invoice = self.issued_invoice("APT-PAYOS-STATE-CONFLICT")
        create_checkout_mock.side_effect = ValidationError(
            "Hóa đơn không còn ở trạng thái chờ thanh toán."
        )
        self.client.force_authenticate(self.patient_user)

        response = self.client.post(
            reverse("patients:invoice-payos", kwargs={"invoice_id": invoice.pk})
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "invoice_not_payable")
        self.assertIn("không còn", response.data["message"])

    @patch("apps.billing.payos_service.PayOS")
    def test_payos_provider_failures_are_marked_for_review_and_return_bad_gateway(self, payos_class):
        self.client.force_authenticate(self.patient_user)
        provider_errors = (
            PayOSError("provider unavailable"),
            httpx.ConnectError("network unavailable"),
        )

        for index, provider_error in enumerate(provider_errors):
            with self.subTest(provider_error=type(provider_error).__name__):
                invoice = self.issued_invoice(f"APT-PAYOS-FAIL-{index}")
                self.client.force_authenticate(self.patient_user)
                payos_class.return_value.payment_requests.create.side_effect = provider_error

                response = self.client.post(
                    reverse("patients:invoice-payos", kwargs={"invoice_id": invoice.pk})
                )

                self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
                self.assertIn("payOS", response.data["message"])
                payos_transaction = PayosTransaction.objects.get(invoice=invoice)
                self.assertEqual(
                    payos_transaction.status, PayosTransaction.Status.NEEDS_REVIEW
                )
                self.assertEqual(payos_transaction.checkout_url, "")

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

    @patch("apps.billing.management_views.create_checkout")
    def test_manager_can_create_payos_checkout_for_counter(self, create_checkout_mock):
        invoice = self.issued_invoice("APT-COUNTER-QR")
        checkout = PayosTransaction.objects.create(
            invoice=invoice,
            initiated_by=self.admin,
            amount=500000,
            checkout_url="https://pay.payos.vn/web/counter-qr",
            qr_code="000201010212...",
        )
        create_checkout_mock.return_value = (checkout, True)
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            reverse("management:invoice-payos-checkout", kwargs={"invoice_id": invoice.pk})
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["data"]["order_code"], checkout.order_code)
        self.assertEqual(response.data["data"]["qr_code"], checkout.qr_code)
        create_checkout_mock.assert_called_once_with(invoice=invoice, user=self.admin)

    @patch("apps.billing.payos_service.PayOS")
    def test_counter_cash_cancels_pending_payos_checkout_first(self, payos_class):
        invoice = self.issued_invoice("APT-CASH-AFTER-QR")
        checkout = PayosTransaction.objects.create(
            invoice=invoice,
            initiated_by=self.patient_user,
            amount=500000,
            checkout_url="https://pay.payos.vn/web/cash-after-qr",
        )
        payos_class.return_value.payment_requests.get.return_value = SimpleNamespace(
            status="PENDING"
        )
        payos_class.return_value.payment_requests.cancel.return_value = SimpleNamespace(
            status="CANCELLED"
        )

        payment, created = BillingService.post_payment(
            invoice_id=invoice.pk,
            method=Payment.Method.CASH,
            amount=invoice.total,
            idempotency_key="cash-after-payos-link",
            actor_user=self.admin,
        )

        self.assertTrue(created)
        self.assertEqual(payment.method, Payment.Method.CASH)
        checkout.refresh_from_db()
        self.assertEqual(checkout.status, PayosTransaction.Status.CANCELLED)
        payos_class.return_value.payment_requests.cancel.assert_called_once_with(
            checkout.order_code,
            cancellation_reason="Cash payment at counter",
        )

    @patch("apps.billing.payos_service.PayOS")
    def test_invalid_payos_webhook_has_no_side_effect(self, payos_class):
        invoice = self.issued_invoice("APT-PAYOS-BAD-SIGNATURE")
        PayosTransaction.objects.create(
            invoice=invoice, initiated_by=self.patient_user, amount=500000
        )
        payos_class.return_value.webhooks.verify.side_effect = WebhookError("bad signature")
        self.client.force_authenticate(None)

        with self.assertLogs("apps.billing.payment_views", level="WARNING") as logs:
            response = self.client.post(
                reverse("payos-webhook"), {"data": {}}, format="json"
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Payment.objects.exists())
        self.assertEqual(invoice.payos_transactions.get().status, PayosTransaction.Status.PENDING)
        self.assertTrue(
            any("payos_webhook_rejected" in message for message in logs.output)
        )
        self.assertFalse(any("bad signature" in message for message in logs.output))

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
    def test_late_webhook_after_counter_cash_requires_review(self, payos_class):
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
        self.assertEqual(Payment.objects.filter(invoice=invoice).count(), 1)
        self.assertTrue(AuditEvent.objects.filter(
            action="PAYOS_PAYMENT_NEEDS_REVIEW",
            resource_id=str(payos_transaction.pk),
        ).exists())

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

    @patch("apps.billing.payos_service.PayOS")
    def test_reconciliation_continues_after_one_payos_lookup_fails(self, payos_class):
        first_invoice = self.issued_invoice("APT-RECONCILE-FAIL")
        second_invoice = self.issued_invoice("APT-RECONCILE-NEXT")
        first = PayosTransaction.objects.create(
            invoice=first_invoice,
            initiated_by=self.patient_user,
            amount=500000,
            checkout_url="https://pay.payos.vn/web/first",
        )
        second = PayosTransaction.objects.create(
            invoice=second_invoice,
            initiated_by=self.patient_user,
            amount=500000,
            checkout_url="https://pay.payos.vn/web/second",
        )
        stale_at = timezone.now() - timedelta(minutes=10)
        PayosTransaction.objects.filter(pk=first.pk).update(
            created_at=stale_at - timedelta(seconds=1)
        )
        PayosTransaction.objects.filter(pk=second.pk).update(created_at=stale_at)
        payos_class.return_value.payment_requests.get.side_effect = [
            PayOSError("first lookup failed"),
            SimpleNamespace(status="CANCELLED"),
        ]

        processed = reconcile_pending_payos_transactions()

        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(processed, 1)
        self.assertEqual(first.status, PayosTransaction.Status.PENDING)
        self.assertEqual(second.status, PayosTransaction.Status.CANCELLED)
        self.assertEqual(payos_class.return_value.payment_requests.get.call_count, 2)
