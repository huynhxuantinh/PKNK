from decimal import Decimal

from django.contrib.gis.geos import Point
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.catalog.models import BranchService, Service
from apps.organizations.models import Organization

from .models import AdministrativeUnit, Branch, Province, Ward


class BranchServicesAPITests(APITestCase):
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
            slug="nha-khoa-anh-duong-services",
        )
        cls.branch = Branch.objects.create(
            organization=cls.organization,
            code="Q1",
            name="Chi nhánh Quận 1",
            province=province,
            ward=ward,
            address_line="12 Nguyễn Huệ",
            location=Point(106.703, 10.776, srid=4326),
        )
        cls.implant = Service.objects.create(
            organization=cls.organization,
            code="IMPLANT",
            name="Cấy ghép Implant",
            description="Phục hình răng mất",
            standard_duration_minutes=60,
            buffer_minutes=15,
            standard_price=Decimal("12000000"),
        )
        cls.branch_implant = BranchService.objects.create(
            branch=cls.branch,
            service=cls.implant,
            price=Decimal("10500000"),
            duration_minutes=75,
        )
        whitening = Service.objects.create(
            organization=cls.organization,
            code="WHITENING",
            name="Tẩy trắng răng",
            standard_duration_minutes=45,
            standard_price=Decimal("2000000"),
            is_active=False,
        )
        BranchService.objects.create(
            branch=cls.branch,
            service=whitening,
            price=Decimal("1800000"),
        )
        inactive_at_branch = Service.objects.create(
            organization=cls.organization,
            code="BRACES",
            name="Niềng răng",
            standard_duration_minutes=30,
            standard_price=Decimal("30000000"),
        )
        BranchService.objects.create(
            branch=cls.branch,
            service=inactive_at_branch,
            price=Decimal("29000000"),
            is_active=False,
        )

    def services_url(self, branch=None):
        branch = branch or self.branch
        return reverse(
            "branches:services",
            kwargs={"id_branch": branch.pk},
        )

    def test_services_are_public_and_return_branch_prices(self):
        response = self.client.get(self.services_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["meta"]["total"], 1)
        service = response.data["data"][0]
        self.assertEqual(service["id_branch_service"], self.branch_implant.pk)
        self.assertEqual(service["name"], "Cấy ghép Implant")
        self.assertEqual(service["price"], "10500000.00")
        self.assertEqual(service["duration_minutes"], 75)
        self.assertEqual(service["buffer_minutes"], 15)

    def test_services_support_search_and_pagination(self):
        cleaning = Service.objects.create(
            organization=self.organization,
            code="CLEANING",
            name="Cạo vôi răng",
            standard_duration_minutes=30,
            standard_price=Decimal("300000"),
        )
        BranchService.objects.create(
            branch=self.branch,
            service=cleaning,
            price=Decimal("350000"),
        )

        search_response = self.client.get(self.services_url(), {"q": "vôi"})
        page_response = self.client.get(self.services_url(), {"page_size": 1})

        self.assertEqual(search_response.data["meta"]["total"], 1)
        self.assertEqual(search_response.data["data"][0]["code"], "CLEANING")
        self.assertEqual(page_response.data["meta"]["total"], 2)
        self.assertEqual(len(page_response.data["data"]), 1)
        self.assertIsNotNone(page_response.data["links"]["next"])

    def test_inactive_or_unknown_branch_returns_404(self):
        self.branch.is_active = False
        self.branch.save(update_fields=["is_active"])

        inactive_response = self.client.get(self.services_url())
        unknown_response = self.client.get(
            reverse("branches:services", kwargs={"id_branch": 999999})
        )

        self.assertEqual(inactive_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(unknown_response.status_code, status.HTTP_404_NOT_FOUND)
