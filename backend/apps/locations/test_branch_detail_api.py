from datetime import time
from decimal import Decimal

from django.contrib.gis.geos import Point
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Dentist, User
from apps.catalog.models import BranchService, Service
from apps.organizations.models import Membership, Organization

from .models import (
    AdministrativeUnit,
    Branch,
    BranchImage,
    BranchOpeningHour,
    Province,
    Ward,
)


class BranchDetailAPITests(APITestCase):
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
            name="Bến Nghé",
            full_name="Phường Bến Nghé",
            administrative_unit=unit,
        )
        cls.organization = Organization.objects.create(
            name="Nha khoa Ánh Dương",
            slug="nha-khoa-anh-duong",
        )
        cls.branch = Branch.objects.create(
            organization=cls.organization,
            code="Q1",
            name="Chi nhánh Quận 1",
            phone="02812345678",
            email="q1@example.com",
            province=province,
            ward=ward,
            address_line="12 Nguyễn Huệ",
            location=Point(106.703, 10.776, srid=4326),
        )
        BranchOpeningHour.objects.create(
            branch=cls.branch,
            weekday=2,
            open_time=time(8, 0),
            close_time=time(18, 0),
        )
        BranchOpeningHour.objects.create(
            branch=cls.branch,
            weekday=1,
            open_time=time(8, 0),
            close_time=time(17, 0),
        )
        BranchImage.objects.create(
            branch=cls.branch,
            storage_key="branches/q1/front.jpg",
            original_name="front.jpg",
            mime_type="image/jpeg",
            size_bytes=1024,
            is_primary=True,
            sort_order=1,
        )
        cls.active_service = Service.objects.create(
            organization=cls.organization,
            code="CAO-VOI",
            name="Cạo vôi răng",
            description="Làm sạch cao răng",
            standard_duration_minutes=30,
            buffer_minutes=10,
            standard_price=Decimal("300000.00"),
        )
        cls.branch_service = BranchService.objects.create(
            branch=cls.branch,
            service=cls.active_service,
            price=Decimal("350000.00"),
        )
        inactive_service = Service.objects.create(
            organization=cls.organization,
            code="AN",
            name="Dịch vụ đã ẩn",
            standard_duration_minutes=30,
            standard_price=Decimal("100000.00"),
            is_active=False,
        )
        BranchService.objects.create(
            branch=cls.branch,
            service=inactive_service,
            price=Decimal("100000.00"),
        )

        dentist_user = User.objects.create_user(
            email="dentist-detail@example.com",
            password="safe-test-password",
            full_name="BS. Nguyễn Minh",
        )
        cls.dentist = Dentist.objects.create(
            user=dentist_user,
            organization=cls.organization,
            license_number="RHM-001",
            biography="Chuyên nha chu",
        )
        Membership.objects.create(
            user=dentist_user,
            organization=cls.organization,
            branch=cls.branch,
            role=Membership.Role.DENTIST,
        )
        hidden_dentist_user = User.objects.create_user(
            email="hidden-dentist@example.com",
            password="safe-test-password",
            full_name="BS. Đã nghỉ",
        )
        Dentist.objects.create(
            user=hidden_dentist_user,
            organization=cls.organization,
            is_active=False,
        )
        Membership.objects.create(
            user=hidden_dentist_user,
            organization=cls.organization,
            branch=cls.branch,
            role=Membership.Role.DENTIST,
        )

    def detail_url(self, branch=None):
        branch = branch or self.branch
        return reverse("branches:detail", kwargs={"id_branch": branch.pk})

    def test_detail_is_public_and_returns_complete_branch_data(self):
        response = self.client.get(self.detail_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertEqual(data["id_branch"], self.branch.pk)
        self.assertEqual(data["organization_name"], self.organization.name)
        self.assertEqual(data["name"], "Chi nhánh Quận 1")
        self.assertEqual(data["province_name"], "Thành phố Hồ Chí Minh")
        self.assertEqual(data["ward_name"], "Phường Bến Nghé")
        self.assertEqual(data["location"], {"latitude": 10.776, "longitude": 106.703})
        self.assertEqual([hour["weekday"] for hour in data["opening_hours"]], [1, 2])
        self.assertEqual(data["images"][0]["storage_key"], "branches/q1/front.jpg")

    def test_detail_returns_active_services_with_effective_booking_values(self):
        response = self.client.get(self.detail_url())

        services = response.data["data"]["services"]
        self.assertEqual(len(services), 1)
        self.assertEqual(services[0]["id_branch_service"], self.branch_service.pk)
        self.assertEqual(services[0]["name"], self.active_service.name)
        self.assertEqual(services[0]["price"], "350000.00")
        self.assertEqual(services[0]["duration_minutes"], 30)
        self.assertEqual(services[0]["buffer_minutes"], 10)

    def test_detail_returns_only_active_dentists_assigned_to_branch(self):
        response = self.client.get(self.detail_url())

        dentists = response.data["data"]["dentists"]
        self.assertEqual(len(dentists), 1)
        self.assertEqual(dentists[0]["id_dentist"], self.dentist.pk)
        self.assertEqual(dentists[0]["full_name"], "BS. Nguyễn Minh")

    def test_inactive_branch_or_organization_is_not_public(self):
        inactive_branch = Branch.objects.create(
            organization=self.organization,
            code="INACTIVE",
            name="Chi nhánh ngừng hoạt động",
            province=self.branch.province,
            ward=self.branch.ward,
            address_line="Địa chỉ ẩn",
            location=Point(106.7, 10.7, srid=4326),
            is_active=False,
        )

        branch_response = self.client.get(self.detail_url(inactive_branch))
        self.organization.is_active = False
        self.organization.save(update_fields=["is_active"])
        organization_response = self.client.get(self.detail_url())

        self.assertEqual(branch_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(organization_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unknown_branch_returns_404_and_post_is_not_allowed(self):
        missing_response = self.client.get(
            reverse("branches:detail", kwargs={"id_branch": 999999})
        )
        post_response = self.client.post(self.detail_url(), {}, format="json")

        self.assertEqual(missing_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(post_response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
