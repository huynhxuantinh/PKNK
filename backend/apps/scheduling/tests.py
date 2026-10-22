from datetime import date, time, timedelta
from decimal import Decimal
from types import SimpleNamespace

from django.contrib.gis.geos import Point
from django.contrib import admin
from django.core.exceptions import FieldDoesNotExist, ValidationError
from django.db import DatabaseError, IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Dentist, PatientProfile, User
from apps.catalog.models import BranchService, Service
from apps.locations.models import (
    AdministrativeUnit,
    Branch,
    Chair,
    Province,
    Ward,
)
from apps.organizations.models import Membership, Organization

from .admin import AppointmentAdmin
from .models import Appointment, AppointmentStatusHistory, WorkShift
from .services import AppointmentService
from .tasks import expire_held_appointments


class SchedulingTestDataMixin:
    @classmethod
    def setUpTestData(cls):
        unit = AdministrativeUnit.objects.create(code=1, full_name="Thành phố")
        province = Province.objects.create(
            code="79",
            name="Hồ Chí Minh",
            full_name="Thành phố Hồ Chí Minh",
            administrative_unit=unit,
        )
        ward = Ward.objects.create(
            code="26734",
            province=province,
            name="Phường thử nghiệm",
            full_name="Phường thử nghiệm",
            administrative_unit=unit,
        )
        cls.organization = Organization.objects.create(
            name="Chuỗi nha khoa thử nghiệm",
            slug="chuoi-nha-khoa-thu-nghiem",
        )
        cls.branch = Branch.objects.create(
            organization=cls.organization,
            code="CN01",
            name="Chi nhánh 1",
            province=province,
            ward=ward,
            address_line="Địa chỉ thử nghiệm",
            location=Point(106.7, 10.8, srid=4326),
        )
        cls.patient_user = User.objects.create_user(
            email="patient-scheduling@example.com",
            password="safe-test-password",
            full_name="Bệnh nhân thử nghiệm",
        )
        cls.patient = PatientProfile.objects.create(user=cls.patient_user)
        Membership.objects.create(
            user=cls.patient_user,
            organization=cls.organization,
            role=Membership.Role.PATIENT,
        )

        cls.dentist_user_1 = User.objects.create_user(
            email="dentist-one@example.com",
            password="safe-test-password",
            full_name="Nha sĩ Một",
        )
        cls.dentist_user_2 = User.objects.create_user(
            email="dentist-two@example.com",
            password="safe-test-password",
            full_name="Nha sĩ Hai",
        )
        cls.dentist_1 = Dentist.objects.create(
            user=cls.dentist_user_1,
            organization=cls.organization,
        )
        cls.dentist_2 = Dentist.objects.create(
            user=cls.dentist_user_2,
            organization=cls.organization,
        )
        cls.chair_1 = Chair.objects.create(
            branch=cls.branch,
            code="G01",
            name="Ghế 1",
            resource_type=Chair.ResourceType.CHAIR,
        )
        cls.chair_2 = Chair.objects.create(
            branch=cls.branch,
            code="G02",
            name="Ghế 2",
            resource_type=Chair.ResourceType.CHAIR,
        )
        service = Service.objects.create(
            organization=cls.organization,
            code="CAO-VOI",
            name="Cạo vôi răng",
            standard_duration_minutes=30,
            buffer_minutes=10,
            standard_price=Decimal("300000.00"),
        )
        cls.branch_service = BranchService.objects.create(
            branch=cls.branch,
            service=service,
            price=Decimal("300000.00"),
        )

    def create_appointment(self, public_code, **overrides):
        starts_at = overrides.pop("starts_at", timezone.now() + timedelta(days=1))
        ends_at = overrides.pop("ends_at", starts_at + timedelta(minutes=30))
        values = {
            "public_code": public_code,
            "patient_profile": self.patient,
            "branch": self.branch,
            "branch_service": self.branch_service,
            "dentist": self.dentist_1,
            "chair": self.chair_1,
            "service_name_snapshot": "Cạo vôi răng",
            "service_price_snapshot": self.branch_service.price,
            "duration_minutes": 30,
            "buffer_minutes": 10,
            "starts_at": starts_at,
            "ends_at": ends_at,
            "occupied_until": ends_at + timedelta(minutes=10),
            "status": Appointment.Status.HELD,
            "held_at": timezone.now(),
            "expires_at": timezone.now() + timedelta(minutes=10),
        }
        values.update(overrides)
        return Appointment.objects.create(**values)


class WorkShiftModelTests(SchedulingTestDataMixin, TestCase):
    def test_shift_end_must_be_after_start(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            WorkShift.objects.create(
                dentist=self.dentist_1,
                branch=self.branch,
                weekday=1,
                start_time=time(17, 0),
                end_time=time(8, 0),
                valid_from=date.today(),
            )


class AppointmentConstraintTests(SchedulingTestDataMixin, TestCase):
    def test_appointment_does_not_store_a_separate_booking_user(self):
        with self.assertRaises(FieldDoesNotExist):
            Appointment._meta.get_field("created_by")

    def test_admin_cannot_create_appointment_manually(self):
        model_admin = AppointmentAdmin(Appointment, admin.site)

        self.assertFalse(model_admin.has_add_permission(request=None))

    def test_admin_cannot_reassign_or_delete_appointment(self):
        admin_user = User.objects.create_superuser(
            email="root-scheduling@example.com",
            password="safe-test-password",
            full_name="Quản trị hệ thống",
        )
        request = SimpleNamespace(user=admin_user)
        model_admin = AppointmentAdmin(Appointment, admin.site)

        self.assertFalse(model_admin.has_change_permission(request))
        self.assertFalse(model_admin.has_delete_permission(request))

    def test_database_prevents_reassigning_appointment_to_another_patient(self):
        other_user = User.objects.create_user(
            email="other-patient-scheduling@example.com",
            password="safe-test-password",
            full_name="Bệnh nhân khác",
        )
        other_profile = PatientProfile.objects.create(user=other_user)
        appointment = self.create_appointment("APT-IMMUTABLE-PATIENT")

        with self.assertRaises(DatabaseError), transaction.atomic():
            Appointment.objects.filter(pk=appointment.pk).update(
                patient_profile=other_profile
            )

    def test_occupied_range_includes_buffer_time(self):
        appointment = self.create_appointment("APT-RANGE")
        appointment.refresh_from_db()

        self.assertEqual(appointment.occupied_range.lower, appointment.starts_at)
        self.assertEqual(
            appointment.occupied_range.upper,
            appointment.occupied_until,
        )

    def test_same_dentist_cannot_have_overlapping_active_appointments(self):
        first = self.create_appointment("APT-DENTIST-1")

        with self.assertRaises(IntegrityError), transaction.atomic():
            self.create_appointment(
                "APT-DENTIST-2",
                starts_at=first.starts_at + timedelta(minutes=15),
                ends_at=first.ends_at + timedelta(minutes=15),
                occupied_until=first.occupied_until + timedelta(minutes=15),
                chair=self.chair_2,
            )

    def test_same_chair_cannot_have_overlapping_active_appointments(self):
        first = self.create_appointment("APT-CHAIR-1")

        with self.assertRaises(IntegrityError), transaction.atomic():
            self.create_appointment(
                "APT-CHAIR-2",
                starts_at=first.starts_at + timedelta(minutes=15),
                ends_at=first.ends_at + timedelta(minutes=15),
                occupied_until=first.occupied_until + timedelta(minutes=15),
                dentist=self.dentist_2,
            )

    def test_cancelled_appointment_releases_dentist_and_chair(self):
        first = self.create_appointment(
            "APT-CANCELLED-1",
            status=Appointment.Status.CANCELLED,
            held_at=None,
            expires_at=None,
            cancelled_at=timezone.now(),
            cancelled_by=self.patient_user,
            cancel_reason="Bệnh nhân chủ động hủy.",
        )

        second = self.create_appointment(
            "APT-CANCELLED-2",
            starts_at=first.starts_at,
            ends_at=first.ends_at,
            occupied_until=first.occupied_until,
        )

        self.assertIsNotNone(second.id_appointment)

    def test_cancelled_appointment_requires_cancelled_by(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.create_appointment(
                "APT-CANCELLED-NO-ACTOR",
                status=Appointment.Status.CANCELLED,
                cancelled_at=timezone.now(),
                cancel_reason="Bệnh nhân hủy lịch.",
                cancelled_by=None,
            )

    def test_cancelled_appointment_rejects_empty_reason(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.create_appointment(
                "APT-CANCELLED-NO-REASON",
                status=Appointment.Status.CANCELLED,
                cancelled_at=timezone.now(),
                cancel_reason="",
                cancelled_by=self.patient_user,
            )


class AppointmentTransitionTests(SchedulingTestDataMixin, TestCase):
    def test_transition_writes_history_and_cancellation_data(self):
        appointment = self.create_appointment("APT-TRANSITION")

        updated = AppointmentService.transition_status(
            appointment_id=appointment.id_appointment,
            to_status=Appointment.Status.CANCELLED,
            actor_type=AppointmentStatusHistory.ActorType.PATIENT,
            actor_user=self.patient_user,
            reason="Bệnh nhân không tiếp tục đặt.",
        )

        self.assertEqual(updated.status, Appointment.Status.CANCELLED)
        self.assertIsNotNone(updated.cancelled_at)
        self.assertTrue(
            updated.status_histories.filter(
                from_status=Appointment.Status.HELD,
                to_status=Appointment.Status.CANCELLED,
                actor_user=self.patient_user,
            ).exists()
        )

    def test_invalid_transition_is_rejected(self):
        appointment = self.create_appointment("APT-INVALID-TRANSITION")

        with self.assertRaises(ValidationError):
            AppointmentService.transition_status(
                appointment_id=appointment.id_appointment,
                to_status=Appointment.Status.COMPLETED,
                actor_type=AppointmentStatusHistory.ActorType.PATIENT,
                actor_user=self.patient_user,
            )

    def test_expired_hold_task_releases_slot_and_writes_history(self):
        now = timezone.now()
        appointment = self.create_appointment(
            "APT-EXPIRED",
            held_at=now - timedelta(minutes=20),
            expires_at=now - timedelta(minutes=10),
        )

        expired_count = expire_held_appointments.run()
        appointment.refresh_from_db()

        self.assertEqual(expired_count, 1)
        self.assertEqual(appointment.status, Appointment.Status.EXPIRED)
        self.assertTrue(
            appointment.status_histories.filter(
                to_status=Appointment.Status.EXPIRED,
                actor_type=AppointmentStatusHistory.ActorType.SYSTEM,
            ).exists()
        )

    def test_status_history_cannot_be_deleted(self):
        appointment = self.create_appointment("APT-APPEND-ONLY")
        AppointmentService.transition_status(
            appointment_id=appointment.id_appointment,
            to_status=Appointment.Status.CANCELLED,
            actor_type=AppointmentStatusHistory.ActorType.PATIENT,
            actor_user=self.patient_user,
            reason="Bệnh nhân chủ động hủy.",
        )
        history = appointment.status_histories.get()

        with self.assertRaises(DatabaseError), transaction.atomic():
            history.delete()
