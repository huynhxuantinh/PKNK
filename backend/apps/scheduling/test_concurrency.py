from datetime import datetime, time, timedelta
from decimal import Decimal
from threading import Event, Thread
from zoneinfo import ZoneInfo

from django.db import close_old_connections, transaction
from django.test import TransactionTestCase
from django.utils import timezone
from unittest.mock import patch

from apps.accounts.models import Dentist, PatientProfile, User
from apps.catalog.models import BranchService, DentistService, Service
from apps.locations.models import Branch, BranchOpeningHour, Chair, Province, Ward
from apps.organizations.models import Membership, Organization

from .availability import AvailabilityService
from .booking import BookingService
from .exceptions import SlotUnavailableError
from .models import TimeOff, WorkShift


class BookingScheduleConcurrencyTests(TransactionTestCase):
    """A schedule edit and a hold must share the dentist-row lock."""

    def setUp(self):
        province = Province.objects.create(code="79", name="HCM", full_name="HCM")
        ward = Ward.objects.create(
            code="00001", province=province, name="Ward", full_name="Ward"
        )
        self.organization = Organization.objects.create(
            name="Concurrency Org", slug="concurrency-org"
        )
        self.branch = Branch.objects.create(
            organization=self.organization,
            code="CON",
            name="Concurrency Branch",
            province=province,
            ward=ward,
            address_line="Address",
            location="POINT(106.7 10.7)",
        )
        self.patient_user = User.objects.create_user(
            email="concurrency-patient@example.com",
            password="StrongPassword!2026",
            full_name="Patient",
            email_verified_at=timezone.now(),
        )
        PatientProfile.objects.create(user=self.patient_user)
        Membership.objects.create(
            user=self.patient_user,
            organization=self.organization,
            role=Membership.Role.PATIENT,
        )
        dentist_user = User.objects.create_user(
            email="concurrency-dentist@example.com",
            password="StrongPassword!2026",
            full_name="Dentist",
            email_verified_at=timezone.now(),
        )
        self.dentist = Dentist.objects.create(
            user=dentist_user,
            organization=self.organization,
        )
        Membership.objects.create(
            user=dentist_user,
            organization=self.organization,
            branch=self.branch,
            role=Membership.Role.DENTIST,
        )
        service = Service.objects.create(
            organization=self.organization,
            code="CON-CLEAN",
            name="Cleaning",
            standard_duration_minutes=30,
            buffer_minutes=0,
            standard_price=Decimal("500000"),
        )
        DentistService.objects.create(dentist=self.dentist, service=service)
        self.branch_service = BranchService.objects.create(
            branch=self.branch,
            service=service,
            price=Decimal("500000"),
        )
        Chair.objects.create(
            branch=self.branch,
            code="CON-C1",
            name="Chair",
            resource_type=Chair.ResourceType.CHAIR,
        )
        self.target_date = timezone.localdate() + timedelta(days=7)
        BranchOpeningHour.objects.create(
            branch=self.branch,
            weekday=self.target_date.isoweekday(),
            open_time=time(8),
            close_time=time(17),
        )
        WorkShift.objects.create(
            dentist=self.dentist,
            branch=self.branch,
            weekday=self.target_date.isoweekday(),
            start_time=time(8),
            end_time=time(17),
            valid_from=self.target_date,
        )
        self.starts_at = datetime.combine(
            self.target_date,
            time(9),
            tzinfo=ZoneInfo(self.organization.timezone),
        )

    def test_hold_rechecks_availability_after_concurrent_time_off(self):
        availability_read = Event()
        time_off_saved = Event()
        worker_errors = []

        def create_time_off():
            close_old_connections()
            try:
                with transaction.atomic():
                    dentist = Dentist.objects.select_for_update().get(pk=self.dentist.pk)
                    self.assertTrue(availability_read.wait(timeout=5))
                    TimeOff.objects.create(
                        dentist=dentist,
                        branch=self.branch,
                        starts_at=self.starts_at,
                        ends_at=self.starts_at + timedelta(minutes=30),
                        reason="Concurrent leave",
                    )
                time_off_saved.set()
            except Exception as error:  # pragma: no cover - surfaced below
                worker_errors.append(error)
                time_off_saved.set()
            finally:
                close_old_connections()

        worker = Thread(target=create_time_off)
        worker.start()

        original_list_slots = AvailabilityService.list_slots
        first_read = True

        def list_slots_with_pause(**kwargs):
            nonlocal first_read
            options = original_list_slots(**kwargs)
            if first_read:
                first_read = False
                availability_read.set()
                self.assertTrue(time_off_saved.wait(timeout=5))
            return options

        with patch.object(
            AvailabilityService,
            "list_slots",
            side_effect=list_slots_with_pause,
        ):
            with self.assertRaises(SlotUnavailableError):
                BookingService.create_hold(
                    patient_user=User.objects.get(pk=self.patient_user.pk),
                    branch_service=BranchService.objects.select_related(
                        "branch__organization", "service"
                    ).get(pk=self.branch_service.pk),
                    starts_at=self.starts_at,
                    requested_dentist=None,
                )

        worker.join(timeout=5)
        self.assertFalse(worker.is_alive())
        self.assertEqual(worker_errors, [])
        self.assertTrue(TimeOff.objects.exists())
