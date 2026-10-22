from datetime import UTC, datetime, time
from decimal import Decimal
from unittest.mock import patch

from django.contrib.gis.geos import Point
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Dentist, User
from apps.catalog.models import BranchService, DentistService, Service
from apps.organizations.models import Membership, Organization

from .models import (
    AdministrativeUnit,
    Branch,
    BranchImage,
    BranchOpeningHour,
    Holiday,
    Province,
    Ward,
)


class BranchListAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        unit = AdministrativeUnit.objects.create(code=1, full_name="Thành phố")
        cls.hcm = Province.objects.create(
            code="79", name="Hồ Chí Minh", full_name="Thành phố Hồ Chí Minh",
            administrative_unit=unit,
        )
        cls.hanoi = Province.objects.create(
            code="01", name="Hà Nội", full_name="Thành phố Hà Nội",
            administrative_unit=unit,
        )
        cls.ward_q1 = Ward.objects.create(
            code="26734", province=cls.hcm, name="Bến Nghé",
            full_name="Phường Bến Nghé", administrative_unit=unit,
        )
        cls.ward_q3 = Ward.objects.create(
            code="27139", province=cls.hcm, name="Võ Thị Sáu",
            full_name="Phường Võ Thị Sáu", administrative_unit=unit,
        )
        cls.ward_hanoi = Ward.objects.create(
            code="00001", province=cls.hanoi, name="Ba Đình",
            full_name="Phường Ba Đình", administrative_unit=unit,
        )
        cls.organization = Organization.objects.create(
            name="Nha khoa Ánh Dương", slug="nha-khoa-anh-duong",
        )
        cls.near_branch = cls.make_branch(
            "Q1", "Chi nhánh Quận 1", cls.hcm, cls.ward_q1, 106.701, 10.771,
        )
        cls.mid_branch = cls.make_branch(
            "Q3", "Chi nhánh Quận 3", cls.hcm, cls.ward_q3, 106.73, 10.80,
        )
        cls.far_branch = cls.make_branch(
            "HN", "Chi nhánh Hà Nội", cls.hanoi, cls.ward_hanoi, 105.834, 21.028,
        )
        cls.make_branch(
            "OFF", "Chi nhánh ngừng hoạt động", cls.hcm, cls.ward_q1,
            106.702, 10.772, is_active=False,
        )
        inactive_org = Organization.objects.create(
            name="Chuỗi đã đóng", slug="chuoi-da-dong", is_active=False,
        )
        cls.make_branch(
            "ORG-OFF", "Chi nhánh thuộc chuỗi đã đóng", cls.hcm, cls.ward_q1,
            106.703, 10.773, organization=inactive_org,
        )

        BranchImage.objects.create(
            branch=cls.near_branch, storage_key="branches/q1/primary.jpg",
            original_name="primary.jpg", mime_type="image/jpeg", size_bytes=1024,
            is_primary=True,
        )
        cls.service = Service.objects.create(
            organization=cls.organization, code="IMPLANT", name="Cấy ghép Implant",
            standard_duration_minutes=60, standard_price=Decimal("10000000"),
        )
        BranchService.objects.create(
            branch=cls.near_branch, service=cls.service, price=Decimal("9000000"),
        )
        dentist_user = User.objects.create_user(
            email="dentist-list@example.com", password="safe-test-password",
            full_name="BS. Minh",
        )
        cls.dentist = Dentist.objects.create(
            user=dentist_user, organization=cls.organization,
        )
        Membership.objects.create(
            user=dentist_user, organization=cls.organization,
            branch=cls.near_branch, role=Membership.Role.DENTIST,
        )
        DentistService.objects.create(dentist=cls.dentist, service=cls.service)

        for branch in (cls.near_branch, cls.mid_branch):
            BranchOpeningHour.objects.create(
                branch=branch, weekday=1, open_time=time(8), close_time=time(17),
            )
        Holiday.objects.create(
            organization=cls.organization, branch=cls.mid_branch,
            holiday_date=datetime(2026, 10, 5).date(), name="Nghỉ riêng",
        )

    @classmethod
    def make_branch(
        cls, code, name, province, ward, longitude, latitude,
        *, is_active=True, organization=None,
    ):
        return Branch.objects.create(
            organization=organization or cls.organization, code=code, name=name,
            province=province, ward=ward, address_line=f"Địa chỉ {code}",
            location=Point(longitude, latitude, srid=4326), is_active=is_active,
        )

    def setUp(self):
        self.url = reverse("branches:list")

    def test_list_is_public_paginated_and_excludes_inactive_records(self):
        response = self.client.get(self.url, {"page_size": 2})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["meta"]["total"], 3)
        self.assertEqual(response.data["meta"]["page_size"], 2)
        self.assertEqual(response.data["meta"]["total_pages"], 2)
        self.assertEqual(len(response.data["data"]), 2)
        self.assertIsNotNone(response.data["links"]["next"])
        self.assertIsNone(response.data["data"][0]["distance_km"])

    def test_near_me_uses_postgis_distance_sorting_and_radius(self):
        response = self.client.get(
            self.url,
            {"latitude": 10.77, "longitude": 106.70, "radius_km": 10},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["meta"]["total"], 2)
        self.assertEqual(response.data["data"][0]["id_branch"], self.near_branch.pk)
        self.assertLess(
            response.data["data"][0]["distance_km"],
            response.data["data"][1]["distance_km"],
        )

    def test_invalid_location_parameters_return_400(self):
        missing_pair = self.client.get(self.url, {"latitude": 10.77})
        bad_latitude = self.client.get(
            self.url, {"latitude": 91, "longitude": 106.70},
        )
        radius_without_location = self.client.get(self.url, {"radius_km": 5})

        self.assertEqual(missing_pair.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(bad_latitude.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(radius_without_location.status_code, status.HTTP_400_BAD_REQUEST)

    def test_filters_by_text_location_service_and_dentist(self):
        filters = (
            {"q": "Quận 1"},
            {"province_code": self.hcm.pk, "ward_code": self.ward_q1.pk},
            {"service_id": self.service.pk},
            {"dentist_id": self.dentist.pk},
            {"service_id": self.service.pk, "dentist_id": self.dentist.pk},
        )

        for params in filters:
            with self.subTest(params=params):
                response = self.client.get(self.url, params)
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(response.data["meta"]["total"], 1)
                self.assertEqual(response.data["data"][0]["id_branch"], self.near_branch.pk)

    @patch("apps.locations.api_views.timezone.now")
    def test_open_now_respects_opening_hours_and_branch_holiday(self, mocked_now):
        mocked_now.return_value = datetime(2026, 10, 5, 3, 0, tzinfo=UTC)

        unfiltered_response = self.client.get(self.url)
        response = self.client.get(self.url, {"open_now": "true"})

        self.assertEqual(unfiltered_response.status_code, status.HTTP_200_OK)
        self.assertEqual(unfiltered_response.data["meta"]["total"], 3)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["meta"]["total"], 1)
        self.assertEqual(response.data["data"][0]["id_branch"], self.near_branch.pk)
        self.assertTrue(response.data["data"][0]["is_open_now"])
        self.assertEqual(
            response.data["data"][0]["primary_image"]["storage_key"],
            "branches/q1/primary.jpg",
        )
