import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal
from threading import Event, Lock
from types import SimpleNamespace
from unittest.mock import patch

from django.db import close_old_connections
from django.test import TransactionTestCase, override_settings
from django.utils import timezone

from apps.accounts.models import Dentist, PatientProfile, User
from apps.catalog.models import BranchService, Service
from apps.locations.models import Branch, Chair, Province, Ward
from apps.organizations.models import Organization
from apps.scheduling.models import Appointment

from .models import Invoice, PayosTransaction
from .payos_service import create_checkout


@override_settings(
    PAYOS_CLIENT_ID="test-client",
    PAYOS_API_KEY="test-api-key",
    PAYOS_CHECKSUM_KEY="test-checksum-key",
)
class PayosCheckoutConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        province = Province.objects.create(code="79", name="HCM", full_name="HCM")
        ward = Ward.objects.create(
            code="00001", province=province, name="Ward", full_name="Ward"
        )
        organization = Organization.objects.create(name="Race Org", slug="race-org")
        branch = Branch.objects.create(
            organization=organization,
            code="RACE",
            name="Race Branch",
            province=province,
            ward=ward,
            address_line="Address",
            location="POINT(106.7 10.7)",
        )
        self.user = User.objects.create_user(
            email="race-patient@example.com",
            password="StrongPassword!2026",
            full_name="Race Patient",
            email_verified_at=timezone.now(),
        )
        patient = PatientProfile.objects.create(user=self.user)
        dentist_user = User.objects.create_user(
            email="race-dentist@example.com",
            password="StrongPassword!2026",
            full_name="Race Dentist",
            email_verified_at=timezone.now(),
        )
        dentist = Dentist.objects.create(user=dentist_user, organization=organization)
        service = Service.objects.create(
            organization=organization,
            code="RACE",
            name="Race Service",
            standard_duration_minutes=30,
            standard_price=Decimal("500000"),
        )
        branch_service = BranchService.objects.create(
            branch=branch, service=service, price=Decimal("500000")
        )
        chair = Chair.objects.create(branch=branch, code="R1", name="Race Chair")
        starts_at = timezone.now() - timedelta(hours=2)
        appointment = Appointment.objects.create(
            public_code="APT-PAYOS-RACE",
            patient_profile=patient,
            branch=branch,
            branch_service=branch_service,
            dentist=dentist,
            chair=chair,
            service_name_snapshot=service.name,
            service_price_snapshot=Decimal("500000"),
            duration_minutes=30,
            buffer_minutes=0,
            starts_at=starts_at,
            ends_at=starts_at + timedelta(minutes=30),
            occupied_until=starts_at + timedelta(minutes=30),
            status=Appointment.Status.COMPLETED,
            completed_at=timezone.now(),
        )
        self.invoice = Invoice.objects.create(
            appointment=appointment,
            branch=branch,
            patient_profile=patient,
            invoice_number="INV-PAYOS-RACE",
            status=Invoice.Status.ISSUED,
            subtotal=Decimal("500000"),
            total=Decimal("500000"),
            created_by=self.user,
            issued_by=self.user,
            issued_at=timezone.now(),
        )

    @patch("apps.billing.payos_service.PayOS")
    def test_two_simultaneous_checkout_requests_reuse_one_payment_link(self, payos_class):
        first_provider_call_started = Event()
        release_first_provider_call = Event()
        counter_lock = Lock()
        provider_call_count = 0

        def create_payment_link(*, payment_data):
            nonlocal provider_call_count
            with counter_lock:
                provider_call_count += 1
                call_number = provider_call_count
            if call_number == 1:
                first_provider_call_started.set()
                self.assertTrue(release_first_provider_call.wait(timeout=5))
            return SimpleNamespace(
                checkout_url=f"https://pay.payos.vn/web/race-{call_number}",
                payment_link_id=f"race-{call_number}",
            )

        payos_class.return_value.payment_requests.create.side_effect = create_payment_link

        def checkout():
            close_old_connections()
            try:
                invoice = Invoice.objects.get(pk=self.invoice.pk)
                user = User.objects.get(pk=self.user.pk)
                payos_transaction, created = create_checkout(invoice=invoice, user=user)
                return payos_transaction.order_code, created, payos_transaction.checkout_url
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(checkout)
            self.assertTrue(first_provider_call_started.wait(timeout=5))
            second = executor.submit(checkout)
            time.sleep(0.25)
            release_first_provider_call.set()
            results = [first.result(timeout=5), second.result(timeout=5)]

        self.assertEqual(provider_call_count, 1)
        self.assertEqual(PayosTransaction.objects.filter(invoice=self.invoice).count(), 1)
        self.assertEqual({result[0] for result in results}, {results[0][0]})
        self.assertEqual(sorted(result[1] for result in results), [False, True])
        self.assertEqual({result[2] for result in results}, {"https://pay.payos.vn/web/race-1"})
