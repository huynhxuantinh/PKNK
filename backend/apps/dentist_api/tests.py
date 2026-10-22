from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.urls import reverse
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Dentist, PatientProfile, User
from apps.audit.models import AuditEvent
from apps.catalog.models import BranchService, Service
from apps.locations.models import Branch, Chair, Province, Ward
from apps.organizations.models import Membership, Organization
from apps.scheduling.models import Appointment, AppointmentStatusHistory
from apps.scheduling.services import AppointmentService


class DentistAppointmentAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        province = Province.objects.create(code="79", name="HCM", full_name="HCM")
        ward = Ward.objects.create(
            code="00001", province=province, name="Ward", full_name="Ward"
        )
        cls.organization = Organization.objects.create(
            name="Dental Org", slug="dentist-api-org"
        )
        cls.branch = Branch.objects.create(
            organization=cls.organization,
            code="D1",
            name="Dental Branch",
            province=province,
            ward=ward,
            address_line="Address",
            location="POINT(106.7 10.7)",
        )
        cls.dentist_user = cls.make_user("dentist-api@example.com", "Dentist A")
        cls.dentist = Dentist.objects.create(
            user=cls.dentist_user, organization=cls.organization
        )
        cls.dentist_membership = Membership.objects.create(
            user=cls.dentist_user,
            organization=cls.organization,
            branch=cls.branch,
            role=Membership.Role.DENTIST,
        )
        cls.other_dentist_user = cls.make_user(
            "other-dentist-api@example.com", "Dentist B"
        )
        cls.other_dentist = Dentist.objects.create(
            user=cls.other_dentist_user, organization=cls.organization
        )
        Membership.objects.create(
            user=cls.other_dentist_user,
            organization=cls.organization,
            branch=cls.branch,
            role=Membership.Role.DENTIST,
        )
        patient_user = cls.make_user("dentist-patient@example.com", "Patient A")
        cls.patient = PatientProfile.objects.create(
            user=patient_user,
            phone="0901234567",
            date_of_birth="2000-01-02",
            gender=PatientProfile.Gender.FEMALE,
        )
        Membership.objects.create(
            user=patient_user,
            organization=cls.organization,
            role=Membership.Role.PATIENT,
        )
        cls.service = Service.objects.create(
            organization=cls.organization,
            code="EXAM",
            name="Dental exam",
            standard_duration_minutes=30,
            buffer_minutes=10,
            standard_price=Decimal("200000"),
        )
        cls.branch_service = BranchService.objects.create(
            branch=cls.branch,
            service=cls.service,
            price=Decimal("200000"),
        )
        cls.chair = Chair.objects.create(
            branch=cls.branch,
            code="C1",
            name="Chair 1",
            resource_type=Chair.ResourceType.CHAIR,
        )
        cls.other_chair = Chair.objects.create(
            branch=cls.branch,
            code="C2",
            name="Chair 2",
            resource_type=Chair.ResourceType.CHAIR,
        )
        cls.target_date = timezone.localdate() + timedelta(days=1)

    @classmethod
    def make_user(cls, email, full_name):
        return User.objects.create_user(
            email=email,
            password="StrongPassword!2026",
            full_name=full_name,
            email_verified_at=timezone.now(),
        )

    @classmethod
    def at(cls, hour):
        return datetime.combine(
            cls.target_date,
            time(hour),
            tzinfo=ZoneInfo("Asia/Ho_Chi_Minh"),
        )

    def appointment(
        self,
        code,
        *,
        dentist=None,
        chair=None,
        starts_at=None,
        appointment_status=Appointment.Status.CONFIRMED,
    ):
        dentist = dentist or self.dentist
        chair = chair or self.chair
        starts_at = starts_at or self.at(9)
        return Appointment.objects.create(
            public_code=code,
            patient_profile=self.patient,
            contact_name_snapshot="Người đặt lịch",
            contact_phone_snapshot="0987654321",
            contact_email_snapshot="nguoi-dat@example.com",
            patient_note="Đau răng số 7 khi ăn.",
            branch=self.branch,
            branch_service=self.branch_service,
            dentist=dentist,
            chair=chair,
            service_name_snapshot=self.service.name,
            service_price_snapshot=self.branch_service.price,
            duration_minutes=30,
            buffer_minutes=10,
            starts_at=starts_at,
            ends_at=starts_at + timedelta(minutes=30),
            occupied_until=starts_at + timedelta(minutes=40),
            status=appointment_status,
            confirmed_at=timezone.now(),
            checked_in_at=(
                timezone.now()
                if appointment_status == Appointment.Status.CHECKED_IN
                else None
            ),
        )

    def test_schedule_only_returns_current_dentist_appointments(self):
        own = self.appointment("APT-DENTIST-OWN")
        self.appointment(
            "APT-DENTIST-OTHER",
            dentist=self.other_dentist,
            chair=self.other_chair,
            starts_at=self.at(10),
        )
        self.client.force_authenticate(self.dentist_user)

        response = self.client.get(
            reverse("dentist_api:schedule"),
            {
                "date_from": self.at(0).isoformat(),
                "date_to": self.at(23).isoformat(),
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item["public_code"] for item in response.data["data"]], [own.public_code])
        item = response.data["data"][0]
        self.assertEqual(item["contact_name_snapshot"], "Người đặt lịch")
        self.assertEqual(item["contact_phone_snapshot"], "0987654321")
        self.assertEqual(item["contact_email_snapshot"], "nguoi-dat@example.com")
        self.assertEqual(item["patient_note"], "Đau răng số 7 khi ăn.")

    def test_membership_revocation_immediately_blocks_schedule(self):
        self.client.force_authenticate(self.dentist_user)
        self.dentist_membership.is_active = False
        self.dentist_membership.save(update_fields=["is_active"])

        response = self.client.get(
            reverse("dentist_api:schedule"),
            {"date_from": self.at(0).isoformat(), "date_to": self.at(23).isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_service_rejects_start_after_membership_revocation(self):
        appointment = self.appointment(
            "APT-DENTIST-REVOKED-SERVICE",
            appointment_status=Appointment.Status.CHECKED_IN,
        )
        self.dentist_membership.is_active = False
        self.dentist_membership.save(update_fields=["is_active"])

        with self.assertRaises(ValidationError):
            AppointmentService.transition_status(
                appointment_id=appointment.pk,
                to_status=Appointment.Status.IN_PROGRESS,
                actor_type=AppointmentStatusHistory.ActorType.DENTIST,
                actor_user=self.dentist_user,
            )

    def test_dentist_cannot_view_another_dentist_appointment(self):
        appointment = self.appointment(
            "APT-DENTIST-HIDDEN", dentist=self.other_dentist
        )
        self.client.force_authenticate(self.dentist_user)

        response = self.client.get(
            reverse(
                "dentist_api:appointment-detail",
                kwargs={"public_code": appointment.public_code},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_start_changes_checked_in_to_in_progress_with_history_and_audit(self):
        appointment = self.appointment(
            "APT-DENTIST-START",
            appointment_status=Appointment.Status.CHECKED_IN,
        )
        self.client.force_authenticate(self.dentist_user)

        response = self.client.post(
            reverse(
                "dentist_api:appointment-start",
                kwargs={"public_code": appointment.public_code},
            )
        )

        appointment.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(appointment.status, Appointment.Status.IN_PROGRESS)
        self.assertIsNotNone(appointment.started_at)
        self.assertTrue(
            appointment.status_histories.filter(
                from_status=Appointment.Status.CHECKED_IN,
                to_status=Appointment.Status.IN_PROGRESS,
            ).exists()
        )
        self.assertTrue(
            AuditEvent.objects.filter(
                action="APPOINTMENT_STATUS_CHANGED",
                resource_id=str(appointment.pk),
            ).exists()
        )

    def test_start_rejects_wrong_status(self):
        appointment = self.appointment("APT-DENTIST-WRONG-STATUS")
        self.client.force_authenticate(self.dentist_user)

        response = self.client.post(
            reverse(
                "dentist_api:appointment-start",
                kwargs={"public_code": appointment.public_code},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_patient_summary_requires_assigned_active_appointment_and_is_audited(self):
        appointment = self.appointment("APT-DENTIST-SUMMARY")
        self.client.force_authenticate(self.dentist_user)
        url = reverse(
            "dentist_api:patient-summary",
            kwargs={"patient_profile_id": self.patient.pk},
        )

        missing_context = self.client.get(url)
        response = self.client.get(url, {"appointment_code": appointment.public_code})

        self.assertEqual(missing_context.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["full_name"], "Patient A")
        self.assertTrue(
            AuditEvent.objects.filter(
                access_type=AuditEvent.AccessType.READ,
                action="PATIENT_SUMMARY_VIEWED",
                resource_id=str(self.patient.pk),
            ).exists()
        )

    def test_inactive_dentist_profile_is_forbidden(self):
        self.dentist.is_active = False
        self.dentist.save(update_fields=["is_active"])
        self.client.force_authenticate(self.dentist_user)

        response = self.client.get(
            reverse("dentist_api:schedule"),
            {"date_from": self.at(0).isoformat(), "date_to": self.at(23).isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_complete_requires_clinical_record(self):
        appointment = self.appointment(
            "APT-DENTIST-NO-COMPLETE",
            appointment_status=Appointment.Status.IN_PROGRESS,
        )
        self.client.force_authenticate(self.dentist_user)

        response = self.client.post(
            reverse(
                "dentist_api:appointment-complete",
                kwargs={"public_code": appointment.public_code},
            )
        )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
