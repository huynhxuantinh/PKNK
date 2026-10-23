from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.contrib.gis.geos import Point
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Dentist, PatientProfile, User
from apps.catalog.models import BranchService, DentistService, Service
from apps.locations.models import (
    AdministrativeUnit,
    Branch,
    BranchOpeningHour,
    Chair,
    Province,
    Ward,
)
from apps.organizations.models import Membership, Organization

from .models import Appointment, WorkShift


class SchedulingApiTests(APITestCase):
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
            name="Chuỗi nha khoa API",
            slug="chuoi-nha-khoa-api",
        )
        cls.branch = Branch.objects.create(
            organization=cls.organization,
            code="CN-API",
            name="Chi nhánh API",
            province=province,
            ward=ward,
            address_line="Địa chỉ thử nghiệm",
            location=Point(106.7, 10.8, srid=4326),
        )
        cls.patient_user = User.objects.create_user(
            email="patient-api@example.com",
            password="safe-test-password",
            email_verified_at=timezone.now(),
            full_name="Bệnh nhân API",
        )
        cls.patient = PatientProfile.objects.create(user=cls.patient_user)
        Membership.objects.create(
            user=cls.patient_user,
            organization=cls.organization,
            role=Membership.Role.PATIENT,
        )
        cls.other_user = User.objects.create_user(
            email="other-api@example.com",
            password="safe-test-password",
            full_name="Người dùng khác",
        )
        dentist_user = User.objects.create_user(
            email="dentist-api@example.com",
            password="safe-test-password",
            full_name="Nha sĩ API",
        )
        cls.dentist = Dentist.objects.create(
            user=dentist_user,
            organization=cls.organization,
        )
        Membership.objects.create(
            user=dentist_user,
            organization=cls.organization,
            branch=cls.branch,
            role=Membership.Role.DENTIST,
        )
        cls.chair = Chair.objects.create(
            branch=cls.branch,
            code="G-API",
            name="Ghế API",
            resource_type=Chair.ResourceType.CHAIR,
        )
        service = Service.objects.create(
            organization=cls.organization,
            code="TRAM-RANG",
            name="Trám răng",
            standard_duration_minutes=30,
            buffer_minutes=10,
            standard_price=Decimal("500000.00"),
        )
        cls.branch_service = BranchService.objects.create(
            branch=cls.branch,
            service=service,
            price=Decimal("500000.00"),
        )
        DentistService.objects.create(dentist=cls.dentist, service=service)

        cls.target_date = timezone.localdate() + timedelta(days=7)
        BranchOpeningHour.objects.create(
            branch=cls.branch,
            weekday=cls.target_date.isoweekday(),
            open_time=time(9, 0),
            close_time=time(12, 0),
        )
        WorkShift.objects.create(
            dentist=cls.dentist,
            branch=cls.branch,
            weekday=cls.target_date.isoweekday(),
            start_time=time(9, 0),
            end_time=time(12, 0),
            valid_from=cls.target_date,
        )

    @classmethod
    def start_at(cls, hour=9, minute=0):
        return datetime.combine(
            cls.target_date,
            time(hour, minute),
            tzinfo=ZoneInfo("Asia/Ho_Chi_Minh"),
        )

    def test_slot_search_returns_available_times(self):
        response = self.client.get(
            reverse("scheduling:slot-list"),
            {
                "branch_service_id": self.branch_service.id_branch_service,
                "date": self.target_date.isoformat(),
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(len(response.data["data"]), 0)
        self.assertEqual(
            response.data["data"][0]["starts_at"],
            self.start_at().isoformat(),
        )

    def test_create_hold_requires_authentication(self):
        response = self.client.post(
            reverse("scheduling:appointment-hold"),
            {
                "branch_service_id": self.branch_service.id_branch_service,
                "starts_at": self.start_at().isoformat(),
            },
            format="json",
        )

        self.assertIn(
            response.status_code,
            {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN},
        )

    def test_create_hold_requires_verified_email(self):
        self.client.force_authenticate(self.other_user)

        response = self.client.post(
            reverse("scheduling:appointment-hold"),
            {
                "branch_service_id": self.branch_service.id_branch_service,
                "starts_at": self.start_at().isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_hold_auto_assigns_dentist_and_chair(self):
        self.client.force_authenticate(self.patient_user)

        response = self.client.post(
            reverse("scheduling:appointment-hold"),
            {
                "branch_service_id": self.branch_service.id_branch_service,
                "starts_at": self.start_at().isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        appointment = Appointment.objects.get(public_code=response.data["data"]["public_code"])
        self.assertEqual(appointment.dentist, self.dentist)
        self.assertEqual(appointment.chair, self.chair)
        self.assertEqual(appointment.status, Appointment.Status.HELD)

    def test_create_hold_creates_patient_membership_for_the_organization(self):
        Membership.objects.filter(
            user=self.patient_user,
            organization=self.organization,
            role=Membership.Role.PATIENT,
        ).delete()
        self.client.force_authenticate(self.patient_user)

        response = self.client.post(
            reverse("scheduling:appointment-hold"),
            {
                "branch_service_id": self.branch_service.id_branch_service,
                "starts_at": self.start_at().isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            Membership.objects.filter(
                user=self.patient_user,
                organization=self.organization,
                branch__isnull=True,
                role=Membership.Role.PATIENT,
                is_active=True,
            ).exists()
        )

    def test_create_hold_expires_stale_hold_before_claiming_the_same_slot(self):
        self.client.force_authenticate(self.patient_user)
        payload = {
            "branch_service_id": self.branch_service.id_branch_service,
            "starts_at": self.start_at().isoformat(),
        }

        first_response = self.client.post(
            reverse("scheduling:appointment-hold"),
            payload,
            format="json",
        )
        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        stale_hold = Appointment.objects.get(
            public_code=first_response.data["data"]["public_code"]
        )
        Appointment.objects.filter(pk=stale_hold.pk).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )

        response = self.client.post(
            reverse("scheduling:appointment-hold"),
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        stale_hold.refresh_from_db()
        self.assertEqual(stale_hold.status, Appointment.Status.EXPIRED)

    def test_create_hold_stores_booking_contact_and_patient_note_without_changing_profile(self):
        self.client.force_authenticate(self.patient_user)

        response = self.client.post(
            reverse("scheduling:appointment-hold"),
            {
                "branch_service_id": self.branch_service.id_branch_service,
                "starts_at": self.start_at(9, 45).isoformat(),
                "contact_name": "Người liên hệ khác",
                "contact_phone": "0912345678",
                "contact_email": "contact@example.com",
                "patient_note": "Đau răng số 7 khi nhai.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        appointment = Appointment.objects.get(public_code=response.data["data"]["public_code"])
        self.assertEqual(appointment.contact_name_snapshot, "Người liên hệ khác")
        self.assertEqual(appointment.contact_phone_snapshot, "0912345678")
        self.assertEqual(appointment.patient_note, "Đau răng số 7 khi nhai.")
        self.patient.refresh_from_db()
        self.assertIsNone(self.patient.phone)

    def test_patient_profile_is_derived_from_authenticated_user(self):
        self.client.force_authenticate(self.patient_user)

        response = self.client.post(
            reverse("scheduling:appointment-hold"),
            {
                "branch_service_id": self.branch_service.id_branch_service,
                "starts_at": self.start_at(9, 45).isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        appointment = Appointment.objects.get(
            public_code=response.data["data"]["public_code"]
        )
        self.assertEqual(appointment.patient_profile, self.patient)

    def test_confirm_hold_uses_organization_auto_confirm(self):
        self.client.force_authenticate(self.patient_user)
        hold_response = self.client.post(
            reverse("scheduling:appointment-hold"),
            {
                "branch_service_id": self.branch_service.id_branch_service,
                "starts_at": self.start_at().isoformat(),
            },
            format="json",
        )
        public_code = hold_response.data["data"]["public_code"]

        response = self.client.post(
            reverse(
                "scheduling:appointment-confirm",
                kwargs={"public_code": public_code},
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["status"], Appointment.Status.CONFIRMED)

        retry_response = self.client.post(
            reverse(
                "scheduling:appointment-confirm",
                kwargs={"public_code": public_code},
            ),
            format="json",
        )

        self.assertEqual(retry_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            retry_response.data["data"]["status"], Appointment.Status.CONFIRMED
        )

    def test_patient_can_cancel_own_held_appointment(self):
        self.client.force_authenticate(self.patient_user)
        hold_response = self.client.post(
            reverse("scheduling:appointment-hold"),
            {"branch_service_id": self.branch_service.id_branch_service, "starts_at": self.start_at().isoformat()},
            format="json",
        )

        response = self.client.post(
            reverse("scheduling:appointment-hold-cancel", kwargs={"public_code": hold_response.data["data"]["public_code"]}),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["status"], Appointment.Status.CANCELLED)

    def test_existing_hold_is_removed_from_available_slots(self):
        self.client.force_authenticate(self.patient_user)
        self.client.post(
            reverse("scheduling:appointment-hold"),
            {
                "branch_service_id": self.branch_service.id_branch_service,
                "starts_at": self.start_at().isoformat(),
            },
            format="json",
        )

        response = self.client.get(
            reverse("scheduling:slot-list"),
            {
                "branch_service_id": self.branch_service.id_branch_service,
                "date": self.target_date.isoformat(),
            },
        )
        returned_starts = {slot["starts_at"] for slot in response.data["data"]}

        self.assertNotIn(self.start_at().isoformat(), returned_starts)
        self.assertNotIn(self.start_at(9, 30).isoformat(), returned_starts)
        self.assertIn(self.start_at(9, 45).isoformat(), returned_starts)

    def test_patient_cannot_book_more_than_one_active_appointment_per_day(self):
        self.client.force_authenticate(self.patient_user)
        hold_url = reverse("scheduling:appointment-hold")
        first = self.client.post(
            hold_url,
            {
                "branch_service_id": self.branch_service.id_branch_service,
                "starts_at": self.start_at(9, 0).isoformat(),
            },
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        confirm = self.client.post(
            reverse(
                "scheduling:appointment-confirm",
                kwargs={"public_code": first.data["data"]["public_code"]},
            ),
            format="json",
        )
        self.assertEqual(confirm.status_code, status.HTTP_200_OK)

        response = self.client.post(
            hold_url,
            {
                "branch_service_id": self.branch_service.id_branch_service,
                "starts_at": self.start_at(11, 15).isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["error"]["code"],
            "daily_active_appointment_limit_reached",
        )
