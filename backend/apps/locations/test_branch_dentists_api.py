from decimal import Decimal

from django.contrib.gis.geos import Point
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Dentist, User
from apps.catalog.models import BranchService, DentistService, Service
from apps.organizations.models import Membership, Organization

from .models import AdministrativeUnit, Branch, Province, Ward


class BranchDentistsAPITests(APITestCase):
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
            slug="nha-khoa-anh-duong-dentists",
        )
        cls.branch = cls.make_branch("Q1", "Chi nhánh Quận 1", province, ward)
        cls.other_branch = cls.make_branch("Q3", "Chi nhánh Quận 3", province, ward)
        cls.service = Service.objects.create(
            organization=cls.organization,
            code="IMPLANT",
            name="Cấy ghép Implant",
            standard_duration_minutes=60,
            standard_price=Decimal("10000000"),
        )
        BranchService.objects.create(
            branch=cls.branch,
            service=cls.service,
            price=Decimal("9500000"),
        )
        cls.dentist = cls.make_dentist(
            "minh@example.com", "BS. Nguyễn Minh", "RHM-001"
        )
        DentistService.objects.create(dentist=cls.dentist, service=cls.service)
        Membership.objects.create(
            user=cls.dentist.user,
            organization=cls.organization,
            branch=cls.branch,
            role=Membership.Role.DENTIST,
        )

        other_branch_dentist = cls.make_dentist(
            "other@example.com", "BS. Chi nhánh khác", "RHM-002"
        )
        DentistService.objects.create(
            dentist=other_branch_dentist,
            service=cls.service,
        )
        Membership.objects.create(
            user=other_branch_dentist.user,
            organization=cls.organization,
            branch=cls.other_branch,
            role=Membership.Role.DENTIST,
        )

        no_skill_dentist = cls.make_dentist(
            "no-skill@example.com", "BS. Không làm Implant", "RHM-003"
        )
        Membership.objects.create(
            user=no_skill_dentist.user,
            organization=cls.organization,
            branch=cls.branch,
            role=Membership.Role.DENTIST,
        )

    @classmethod
    def make_branch(cls, code, name, province, ward):
        return Branch.objects.create(
            organization=cls.organization,
            code=code,
            name=name,
            province=province,
            ward=ward,
            address_line=f"Địa chỉ {code}",
            location=Point(106.70, 10.77, srid=4326),
        )

    @classmethod
    def make_dentist(cls, email, full_name, license_number):
        user = User.objects.create_user(
            email=email,
            password="safe-test-password",
            full_name=full_name,
        )
        return Dentist.objects.create(
            user=user,
            organization=cls.organization,
            license_number=license_number,
            biography="Bác sĩ chuyên khoa",
        )

    def dentists_url(self, branch=None):
        return reverse(
            "branches:dentists",
            kwargs={"id_branch": (branch or self.branch).pk},
        )

    def test_returns_only_active_qualified_dentists_at_branch(self):
        response = self.client.get(
            self.dentists_url(),
            {"service_id": self.service.pk},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["meta"]["total"], 1)
        dentist = response.data["data"][0]
        self.assertEqual(dentist["id_dentist"], self.dentist.pk)
        self.assertEqual(dentist["full_name"], "BS. Nguyễn Minh")
        self.assertEqual(dentist["license_number"], "RHM-001")

    def test_service_id_is_required(self):
        response = self.client.get(self.dentists_url())

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("service_id", response.data)

    def test_service_must_be_active_and_offered_at_branch(self):
        unavailable_service = Service.objects.create(
            organization=self.organization,
            code="BRACES",
            name="Niềng răng",
            standard_duration_minutes=30,
            standard_price=Decimal("30000000"),
        )

        response = self.client.get(
            self.dentists_url(),
            {"service_id": unavailable_service.pk},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_supports_search_and_pagination(self):
        second = self.make_dentist(
            "an@example.com", "BS. Trần An", "RHM-004"
        )
        DentistService.objects.create(dentist=second, service=self.service)
        Membership.objects.create(
            user=second.user,
            organization=self.organization,
            branch=self.branch,
            role=Membership.Role.DENTIST,
        )

        search_response = self.client.get(
            self.dentists_url(),
            {"service_id": self.service.pk, "q": "Trần An"},
        )
        page_response = self.client.get(
            self.dentists_url(),
            {"service_id": self.service.pk, "page_size": 1},
        )

        self.assertEqual(search_response.data["meta"]["total"], 1)
        self.assertEqual(search_response.data["data"][0]["id_dentist"], second.pk)
        self.assertEqual(page_response.data["meta"]["total"], 2)
        self.assertEqual(len(page_response.data["data"]), 1)

    def test_inactive_branch_returns_404(self):
        self.branch.is_active = False
        self.branch.save(update_fields=["is_active"])

        response = self.client.get(
            self.dentists_url(),
            {"service_id": self.service.pk},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
