from datetime import datetime, time, timedelta
from decimal import Decimal
from threading import Barrier, Event, Thread
from zoneinfo import ZoneInfo

from django.db import close_old_connections, transaction
from django.test import TransactionTestCase
from django.urls import reverse
from django.utils import timezone
from unittest.mock import patch
from rest_framework import status
from rest_framework.test import APIClient

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
    """Schedule edits and holds must share their resource locks."""

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

    def test_hold_rechecks_branch_service_after_concurrent_deactivation(self):
        deactivation_ready = Event()
        allow_deactivation_commit = Event()
        deactivation_errors = []
        booking_result = []

        def deactivate_branch_service():
            close_old_connections()
            try:
                with transaction.atomic():
                    Organization.objects.select_for_update().get(
                        pk=self.organization.pk
                    )
                    Service.objects.select_for_update().get(
                        pk=self.branch_service.service_id
                    )
                    branch_service = BranchService.objects.select_for_update().get(
                        pk=self.branch_service.pk
                    )
                    branch_service.is_active = False
                    branch_service.save(update_fields=["is_active"])
                    deactivation_ready.set()
                    self.assertTrue(allow_deactivation_commit.wait(timeout=5))
            except Exception as error:  # pragma: no cover - surfaced below
                deactivation_errors.append(error)
                deactivation_ready.set()
            finally:
                close_old_connections()

        def create_hold():
            close_old_connections()
            try:
                self.assertTrue(deactivation_ready.wait(timeout=5))
                BookingService.create_hold(
                    patient_user=User.objects.get(pk=self.patient_user.pk),
                    branch_service=BranchService.objects.select_related(
                        "branch__organization", "service"
                    ).get(pk=self.branch_service.pk),
                    starts_at=self.starts_at,
                )
                booking_result.append("held")
            except Exception as error:  # pragma: no cover - asserted below
                booking_result.append(error)
            finally:
                close_old_connections()

        deactivation_worker = Thread(target=deactivate_branch_service)
        deactivation_worker.start()
        self.assertTrue(deactivation_ready.wait(timeout=5))

        booking_worker = Thread(target=create_hold)
        booking_worker.start()
        self.assertFalse(booking_result)
        allow_deactivation_commit.set()

        deactivation_worker.join(timeout=5)
        booking_worker.join(timeout=5)
        self.assertFalse(deactivation_worker.is_alive())
        self.assertFalse(booking_worker.is_alive())
        self.assertEqual(deactivation_errors, [])
        self.assertEqual(len(booking_result), 1)
        self.assertIsInstance(booking_result[0], SlotUnavailableError)
        self.assertFalse(Appointment.objects.exists())

    def test_opening_hours_change_serializes_with_booking_hold(self):
        target_weekday = self.target_date.isoweekday()
        BranchOpeningHour.objects.filter(
            branch=self.branch, weekday=target_weekday
        ).update(close_time=time(18))
        WorkShift.objects.filter(
            branch=self.branch, dentist=self.dentist, weekday=target_weekday
        ).update(end_time=time(18))
        starts_at = self.starts_at.replace(hour=17, minute=30)

        organization_admin = User.objects.create_user(
            email="concurrency-org-admin@example.com",
            password="StrongPassword!2026",
            full_name="Organization Admin",
            email_verified_at=timezone.now(),
        )
        Membership.objects.create(
            user=organization_admin,
            organization=self.organization,
            role=Membership.Role.ORGANIZATION_ADMIN,
        )
        opening_hours = [
            {
                "weekday": weekday,
                "is_closed": weekday != target_weekday,
                "open_time": "08:00" if weekday == target_weekday else None,
                "close_time": "17:00" if weekday == target_weekday else None,
            }
            for weekday in range(1, 8)
        ]
        slot_read = Event()
        allow_booking_to_finish = Event()
        update_started = Event()
        update_finished = Event()
        booking_result = []
        update_result = []
        worker_errors = []
        original_list_slots = AvailabilityService.list_slots

        def list_slots_with_pause(**kwargs):
            options = original_list_slots(**kwargs)
            slot_read.set()
            self.assertTrue(allow_booking_to_finish.wait(timeout=5))
            return options

        def create_hold():
            close_old_connections()
            try:
                BookingService.create_hold(
                    patient_user=User.objects.get(pk=self.patient_user.pk),
                    branch_service=BranchService.objects.select_related(
                        "branch__organization", "service"
                    ).get(pk=self.branch_service.pk),
                    starts_at=starts_at,
                )
                booking_result.append("held")
            except Exception as error:  # pragma: no cover - surfaced below
                worker_errors.append(error)
            finally:
                close_old_connections()

        def change_opening_hours():
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(user=organization_admin)
                update_started.set()
                response = client.put(
                    reverse(
                        "management:branch-opening-hours",
                        kwargs={"branch_id": self.branch.pk},
                    ),
                    {"opening_hours": opening_hours},
                    format="json",
                )
                update_result.append(response.status_code)
            except Exception as error:  # pragma: no cover - surfaced below
                worker_errors.append(error)
            finally:
                update_finished.set()
                close_old_connections()

        booking_worker = Thread(target=create_hold)
        update_worker = Thread(target=change_opening_hours)
        with patch.object(
            AvailabilityService,
            "list_slots",
            side_effect=list_slots_with_pause,
        ):
            booking_worker.start()
            self.assertTrue(slot_read.wait(timeout=5))
            update_worker.start()
            self.assertTrue(update_started.wait(timeout=5))
            self.assertFalse(update_finished.wait(timeout=0.2))
            allow_booking_to_finish.set()
            booking_worker.join(timeout=5)
            update_worker.join(timeout=5)

        self.assertFalse(booking_worker.is_alive())
        self.assertFalse(update_worker.is_alive())
        self.assertEqual(worker_errors, [])
        self.assertEqual(booking_result, ["held"])
        self.assertEqual(update_result, [status.HTTP_409_CONFLICT])
        appointment = Appointment.objects.get(patient_profile__user=self.patient_user)
        self.assertEqual(appointment.starts_at, starts_at)
        self.assertEqual(
            BranchOpeningHour.objects.get(
                branch=self.branch, weekday=target_weekday
            ).close_time,
            time(18),
        )

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
