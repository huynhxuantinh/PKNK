from django.contrib.gis.geos import Point
from django.db import IntegrityError, connection, transaction
from django.test import TestCase

from apps.organizations.models import Organization

from .models import AdministrativeUnit, Branch, Province, Ward


class BranchModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        unit = AdministrativeUnit.objects.create(code=1, full_name="Tỉnh")
        cls.province_a = Province.objects.create(
            code="01",
            name="Tỉnh A",
            full_name="Tỉnh A",
            administrative_unit=unit,
        )
        cls.province_b = Province.objects.create(
            code="02",
            name="Tỉnh B",
            full_name="Tỉnh B",
            administrative_unit=unit,
        )
        cls.ward_a = Ward.objects.create(
            code="00001",
            province=cls.province_a,
            name="Phường A",
            full_name="Phường A",
            administrative_unit=unit,
        )
        cls.organization = Organization.objects.create(
            name="Chuỗi thử nghiệm",
            slug="chuoi-thu-nghiem",
        )

    def test_branch_accepts_postgis_point(self):
        branch = Branch.objects.create(
            organization=self.organization,
            code="CN01",
            name="Chi nhánh 1",
            province=self.province_a,
            ward=self.ward_a,
            address_line="Địa chỉ thử nghiệm",
            location=Point(106.7, 10.8, srid=4326),
        )

        self.assertEqual(branch.location.srid, 4326)

    def test_branch_ward_must_belong_to_selected_province(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Branch.objects.create(
                organization=self.organization,
                code="CN02",
                name="Chi nhánh sai địa giới",
                province=self.province_b,
                ward=self.ward_a,
                address_line="Địa chỉ thử nghiệm",
                location=Point(106.7, 10.8, srid=4326),
            )
            with connection.cursor() as cursor:
                cursor.execute(
                    "SET CONSTRAINTS fk_branches_ward_province IMMEDIATE"
                )
