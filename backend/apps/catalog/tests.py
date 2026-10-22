from decimal import Decimal

from django.db import DatabaseError, IntegrityError, transaction
from django.test import TestCase

from apps.organizations.models import Organization
from apps.locations.models import Branch, Province, Ward

from .models import BranchService, Service


class ServiceModelTests(TestCase):
    def test_standard_price_cannot_be_negative(self):
        organization = Organization.objects.create(
            name="Chuỗi thử nghiệm",
            slug="chuoi-thu-nghiem",
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            Service.objects.create(
                organization=organization,
                code="IMPLANT",
                name="Cấy ghép Implant",
                standard_duration_minutes=60,
                standard_price=Decimal("-1.00"),
            )

    def test_database_rejects_branch_service_from_another_organization(self):
        province = Province.objects.create(code="79", name="HCM", full_name="HCM")
        ward = Ward.objects.create(code="00001", province=province, name="Ward", full_name="Ward")
        org_a = Organization.objects.create(name="Org A", slug="catalog-org-a")
        org_b = Organization.objects.create(name="Org B", slug="catalog-org-b")
        branch = Branch.objects.create(
            organization=org_a, code="A1", name="A1", province=province,
            ward=ward, address_line="A1", location="POINT(106.7 10.7)",
        )
        service = Service.objects.create(
            organization=org_b, code="S1", name="S1",
            standard_duration_minutes=30, standard_price=100,
        )

        with self.assertRaises(DatabaseError), transaction.atomic():
            BranchService.objects.create(branch=branch, service=service, price=100)
