from datetime import datetime, time, timedelta
from decimal import Decimal
from threading import Barrier, Event, Thread
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
from .models import Appointment, TimeOff, WorkShift
from apps.management_api.exceptions import ManagementConflict
from apps.management_api.scheduling_services import RescheduleService


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
        self.branch_admin = User.objects.create_user(
            email="concurrency-admin@example.com",
            password="StrongPassword!2026",
            full_name="Admin",
            email_verified_at=timezone.now(),
        )
        Membership.objects.create(
            user=self.branch_admin,
            organization=self.organization,
            branch=self.branch,
            role=Membership.Role.BRANCH_ADMIN,
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

    def create_appointment(self, code, *, dentist, chair, starts_at):
        ends_at = starts_at + timedelta(minutes=30)
        return Appointment.objects.create(
            public_code=code,
            patient_profile=PatientProfile.objects.get(user=self.patient_user),
            branch=self.branch,
            branch_service=self.branch_service,
            dentist=dentist,
            chair=chair,
            service_name_snapshot="Cleaning",
            service_price_snapshot=Decimal("500000"),
            duration_minutes=30,
            buffer_minutes=0,
            starts_at=starts_at,
            ends_at=ends_at,
            occupied_until=ends_at,
            status=Appointment.Status.CONFIRMED,
            confirmed_at=timezone.now(),
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
                self.assertEqual(worker_errors, [])
                self.assertTrue(
                    TimeOff.objects.filter(
                        dentist=self.dentist,
                        starts_at=self.starts_at,
                    ).exists()
                )
                refreshed = original_list_slots(**kwargs)
                self.assertNotIn(
                    self.starts_at,
                    {option.starts_at for option in refreshed},
                )
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

    def test_reschedule_rechecks_availability_after_concurrent_time_off(self):
        dentist_two_user = User.objects.create_user(
            email="concurrency-reschedule-dentist@example.com",
            password="StrongPassword!2026",
            full_name="Reschedule Dentist",
            email_verified_at=timezone.now(),
        )
        dentist_two = Dentist.objects.create(
            user=dentist_two_user,
            organization=self.organization,
        )
        Membership.objects.create(
            user=dentist_two_user,
            organization=self.organization,
            branch=self.branch,
            role=Membership.Role.DENTIST,
        )
        DentistService.objects.create(
            dentist=dentist_two,
            service=self.branch_service.service,
        )
        WorkShift.objects.create(
            dentist=dentist_two,
            branch=self.branch,
            weekday=self.target_date.isoweekday(),
            start_time=time(8),
            end_time=time(17),
            valid_from=self.target_date,
        )
        original = self.create_appointment(
            "CON-RESCHEDULE-TIME-OFF",
            dentist=self.dentist,
            chair=Chair.objects.get(branch=self.branch, code="CON-C1"),
            starts_at=self.starts_at - timedelta(days=1),
        )
        time_off_created = Event()
        allow_time_off_commit = Event()
        time_off_saved = Event()
        worker_errors = []
        stale_options = AvailabilityService.list_slots(
            branch_service=self.branch_service,
            target_date=self.target_date,
            dentist=dentist_two,
            exclude_appointment_id=original.pk,
        )

        def create_time_off():
            close_old_connections()
            try:
                with transaction.atomic():
                    dentist = Dentist.objects.select_for_update().get(pk=dentist_two.pk)
                    TimeOff.objects.create(
                        dentist=dentist,
                        branch=self.branch,
                        starts_at=self.starts_at,
                        ends_at=self.starts_at + timedelta(minutes=30),
                        reason="Concurrent leave while rescheduling",
                    )
                    time_off_created.set()
                    self.assertTrue(allow_time_off_commit.wait(timeout=5))
                time_off_saved.set()
            except Exception as error:  # pragma: no cover - surfaced below
                worker_errors.append(error)
                time_off_saved.set()
            finally:
                close_old_connections()

        worker = Thread(target=create_time_off)
        worker.start()
        self.assertTrue(time_off_created.wait(timeout=5))
        original_list_slots = AvailabilityService.list_slots
        first_read = True

        def list_slots_with_pause(**kwargs):
            nonlocal first_read
            if first_read:
                first_read = False
                allow_time_off_commit.set()
                self.assertTrue(time_off_saved.wait(timeout=5))
                self.assertEqual(worker_errors, [])
                self.assertTrue(
                    TimeOff.objects.filter(
                        dentist=dentist_two,
                        starts_at=self.starts_at,
                    ).exists()
                )
                return stale_options
            return original_list_slots(**kwargs)

        with patch.object(
            AvailabilityService,
            "list_slots",
            side_effect=list_slots_with_pause,
        ):
            with self.assertRaises(ManagementConflict):
                RescheduleService.reschedule(
                    appointment=Appointment.objects.get(pk=original.pk),
                    starts_at=self.starts_at,
                    reason="Move appointment",
                    idempotency_key="concurrent-time-off-reschedule",
                    actor_user=self.branch_admin,
                    dentist_id=dentist_two.pk,
                )

        worker.join(timeout=5)
        self.assertFalse(worker.is_alive())
        self.assertEqual(worker_errors, [])
        original.refresh_from_db()
        self.assertEqual(original.status, Appointment.Status.CONFIRMED)

    def test_parallel_reschedules_allow_only_one_target_day_appointment(self):
        dentist_two_user = User.objects.create_user(
            email="concurrency-dentist-two@example.com",
            password="StrongPassword!2026",
            full_name="Dentist Two",
            email_verified_at=timezone.now(),
        )
        dentist_two = Dentist.objects.create(
            user=dentist_two_user,
            organization=self.organization,
        )
        Membership.objects.create(
            user=dentist_two_user,
            organization=self.organization,
            branch=self.branch,
            role=Membership.Role.DENTIST,
        )
        DentistService.objects.create(
            dentist=dentist_two,
            service=self.branch_service.service,
        )
        chair_two = Chair.objects.create(
            branch=self.branch,
            code="CON-C2",
            name="Chair two",
            resource_type=Chair.ResourceType.CHAIR,
        )
        WorkShift.objects.create(
            dentist=dentist_two,
            branch=self.branch,
            weekday=self.target_date.isoweekday(),
            start_time=time(8),
            end_time=time(17),
            valid_from=self.target_date,
        )
        original_one = self.create_appointment(
            "CON-RESCHEDULE-ONE",
            dentist=self.dentist,
            chair=Chair.objects.get(branch=self.branch, code="CON-C1"),
            starts_at=self.starts_at - timedelta(days=2),
        )
        original_two = self.create_appointment(
            "CON-RESCHEDULE-TWO",
            dentist=dentist_two,
            chair=chair_two,
            starts_at=self.starts_at - timedelta(days=1),
        )
        barrier = Barrier(3)
        outcomes = []

        def reschedule(original_id, destination, key):
            close_old_connections()
            try:
                original = Appointment.objects.get(pk=original_id)
                barrier.wait(timeout=5)
                successor, _ = RescheduleService.reschedule(
                    appointment=original,
                    starts_at=destination,
                    reason="Concurrent reschedule",
                    idempotency_key=key,
                    actor_user=User.objects.get(pk=self.branch_admin.pk),
                )
                outcomes.append(("created", successor.pk))
            except ManagementConflict:
                outcomes.append(("conflict", None))
            finally:
                close_old_connections()

        first = Thread(
            target=reschedule,
            args=(original_one.pk, self.starts_at, "concurrent-reschedule-one"),
        )
        second = Thread(
            target=reschedule,
            args=(original_two.pk, self.starts_at + timedelta(hours=1), "concurrent-reschedule-two"),
        )
        first.start()
        second.start()
        barrier.wait(timeout=5)
        first.join(timeout=10)
        second.join(timeout=10)

        self.assertFalse(first.is_alive())
        self.assertFalse(second.is_alive())
        self.assertEqual(sorted(outcome for outcome, _ in outcomes), ["conflict", "created"])
        successors = Appointment.objects.filter(
            patient_profile__user=self.patient_user,
            rescheduled_from__isnull=False,
            starts_at__date=self.target_date,
        )
        self.assertEqual(successors.count(), 1)
