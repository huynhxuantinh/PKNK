import time
from datetime import timedelta
from decimal import Decimal
from threading import Event, Thread

from django.db import close_old_connections, transaction
from django.test import TransactionTestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Dentist, PatientProfile, User
from apps.catalog.models import BranchService, DentistService, Service
from apps.locations.models import Branch, Chair, Province, Ward
from apps.organizations.models import Membership, Organization
from apps.scheduling.models import Appointment

WAIT_TIMEOUT = 10
LOCK_HOLD_SECONDS = 1


class DentistAssignmentConcurrencyTests(TransactionTestCase):
    """Removing a dentist assignment must share the booking dentist lock."""

    reset_sequences = True

    def setUp(self):
        province = Province.objects.create(code="79", name="HCM", full_name="HCM")
        ward = Ward.objects.create(
            code="00001", province=province, name="Ward", full_name="Ward"
        )
        self.organization = Organization.objects.create(
            name="Assignment Concurrency Org", slug="assignment-concurrency-org"
        )
        self.branch = Branch.objects.create(
            organization=self.organization,
            code="AC1",
            name="AC1",
            province=province,
            ward=ward,
            address_line="AC1",
            location="POINT(106.7 10.7)",
        )
        self.org_admin = User.objects.create_user(
            email="assignment-concurrency-admin@example.com",
            password="StrongPassword!2026",
            full_name="Org Admin",
            email_verified_at=timezone.now(),
        )
        Membership.objects.create(
            user=self.org_admin,
            organization=self.organization,
            role=Membership.Role.ORGANIZATION_ADMIN,
        )
        self.patient_user = User.objects.create_user(
            email="assignment-concurrency-patient@example.com",
            password="StrongPassword!2026",
            full_name="Patient",
            email_verified_at=timezone.now(),
        )
        self.patient = PatientProfile.objects.create(user=self.patient_user)
        Membership.objects.create(
            user=self.patient_user,
            organization=self.organization,
            role=Membership.Role.PATIENT,
        )
        dentist_user = User.objects.create_user(
            email="assignment-concurrency-dentist@example.com",
            password="StrongPassword!2026",
            full_name="Dentist",
            email_verified_at=timezone.now(),
        )
        self.dentist = Dentist.objects.create(
            user=dentist_user,
            organization=self.organization,
        )
        self.dentist_membership = Membership.objects.create(
            user=dentist_user,
            organization=self.organization,
            branch=self.branch,
            role=Membership.Role.DENTIST,
        )
        self.service = Service.objects.create(
            organization=self.organization,
            code="AC-CLEAN",
            name="Cleaning",
            standard_duration_minutes=30,
            standard_price=Decimal("500000"),
        )
        self.branch_service = BranchService.objects.create(
            branch=self.branch,
            service=self.service,
            price=Decimal("500000"),
        )
        self.chair = Chair.objects.create(
            branch=self.branch,
            code="AC-C1",
            name="Chair",
            resource_type=Chair.ResourceType.CHAIR,
        )
        self.starts_at = timezone.now() + timedelta(days=2)

    def _simulate_booking_holding_lock(self, created, release, errors):
        """Mimic BookingService: lock the dentist, then create the hold."""
        close_old_connections()
        try:
            with transaction.atomic():
                dentist = Dentist.objects.select_for_update().get(pk=self.dentist.pk)
                ends_at = self.starts_at + timedelta(minutes=30)
                Appointment.objects.create(
                    public_code="APT-ASSIGNMENT-RACE",
                    patient_profile=self.patient,
                    branch=self.branch,
                    branch_service=self.branch_service,
                    dentist=dentist,
                    chair=self.chair,
                    service_name_snapshot=self.service.name,
                    service_price_snapshot=self.branch_service.price,
                    duration_minutes=30,
                    starts_at=self.starts_at,
                    ends_at=ends_at,
                    occupied_until=ends_at,
                    status=Appointment.Status.CONFIRMED,
                    confirmed_at=timezone.now(),
                )
                created.set()
                release.wait(timeout=WAIT_TIMEOUT)
        except Exception as error:  # pragma: no cover - surfaced by the assertion
            errors.append(error)
        finally:
            close_old_connections()

    def _call_api(self, method, url_name, kwargs, payload, results):
        close_old_connections()
        try:
            client = APIClient()
            client.force_authenticate(self.org_admin)
            response = getattr(client, method)(
                reverse(url_name, kwargs=kwargs), payload, format="json"
            )
            results.append(response.status_code)
        finally:
            close_old_connections()

    def _assert_request_waits_for_booking(
        self, *, method, url_name, kwargs, payload
    ):
        created = Event()
        release = Event()
        worker_errors = []
        results = []

        worker = Thread(
            target=self._simulate_booking_holding_lock,
            args=(created, release, worker_errors),
        )
        worker.start()
        self.assertTrue(created.wait(timeout=WAIT_TIMEOUT))

        requester = Thread(
            target=self._call_api,
            args=(method, url_name, kwargs, payload, results),
        )
        requester.start()
        # The request must block on the dentist row. Without the lock it would
        # see no appointment yet and remove the assignment.
        time.sleep(LOCK_HOLD_SECONDS)
        release.set()

        worker.join(timeout=WAIT_TIMEOUT)
        requester.join(timeout=WAIT_TIMEOUT)

        self.assertFalse(worker.is_alive())
        self.assertFalse(requester.is_alive())
        self.assertEqual(worker_errors, [])
        self.assertEqual(results, [status.HTTP_409_CONFLICT])

    def test_removing_service_waits_for_concurrent_booking(self):
        DentistService.objects.create(dentist=self.dentist, service=self.service)

        self._assert_request_waits_for_booking(
            method="put",
            url_name="management:dentist-services",
            kwargs={"dentist_id": self.dentist.pk},
            payload={"ids": []},
        )

        self.assertTrue(
            DentistService.objects.filter(
                dentist=self.dentist, service=self.service
            ).exists()
        )

    def test_removing_branch_waits_for_concurrent_booking(self):
        self._assert_request_waits_for_booking(
            method="put",
            url_name="management:dentist-branches",
            kwargs={"dentist_id": self.dentist.pk},
            payload={"ids": []},
        )

        self.dentist_membership.refresh_from_db()
        self.assertTrue(self.dentist_membership.is_active)
        self.assertEqual(self.dentist_membership.branch_id, self.branch.pk)

    def test_deactivating_membership_waits_for_concurrent_booking(self):
        self._assert_request_waits_for_booking(
            method="patch",
            url_name="management:membership-detail",
            kwargs={"membership_id": self.dentist_membership.pk},
            payload={"is_active": False},
        )

        self.dentist_membership.refresh_from_db()
        self.assertTrue(self.dentist_membership.is_active)
