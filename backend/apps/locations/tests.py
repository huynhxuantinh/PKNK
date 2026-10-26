from django.contrib.gis.geos import Point
from django.db import IntegrityError, connection, transaction
from django.test import TestCase

from apps.accounts.models import User
from apps.organizations.models import Membership, Organization

from .management.commands.seed_demo import Command as SeedDemoCommand
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


class SeedDemoBranchAdminTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        unit = AdministrativeUnit.objects.create(code=2, full_name="City")
        province = Province.objects.create(
            code="79",
            name="Ho Chi Minh",
            full_name="Ho Chi Minh City",
            administrative_unit=unit,
        )
        ward = Ward.objects.create(
            code="79001",
            province=province,
            name="Ward",
            full_name="Ward",
            administrative_unit=unit,
        )
        cls.organization = Organization.objects.create(
            name="Demo organization",
            slug="demo-organization",
        )
        cls.branch_a = Branch.objects.create(
            organization=cls.organization,
            code="Q1",
            name="Branch Q1",
            province=province,
            ward=ward,
            address_line="Address A",
            location=Point(106.7, 10.8, srid=4326),
        )
        cls.branch_b = Branch.objects.create(
            organization=cls.organization,
            code="TD",
            name="Branch TD",
            province=province,
            ward=ward,
            address_line="Address B",
            location=Point(106.8, 10.9, srid=4326),
        )

    def test_branch_admin_accounts_use_stable_codes_and_disable_stale_accounts(self):
        legacy_user = User.objects.create_user(
            email="branch.admin.1@demo.pknk.vn",
            password="OldPassword123!",
            full_name="Legacy manager",
        )
        legacy_membership = Membership.objects.create(
            user=legacy_user,
            organization=self.organization,
            branch=self.branch_a,
            role=Membership.Role.BRANCH_ADMIN,
        )

        command = SeedDemoCommand()
        emails = command._seed_branch_admins(
            organization=self.organization,
            branches={"TD": self.branch_b, "Q1": self.branch_a},
            password="Demo123!",
        )

        self.assertEqual(
            set(emails),
            {
                "branch.admin.q1@demo.pknk.vn",
                "branch.admin.td@demo.pknk.vn",
            },
        )
        self.assertTrue(
            Membership.objects.filter(
                user__email="branch.admin.q1@demo.pknk.vn",
                branch=self.branch_a,
                role=Membership.Role.BRANCH_ADMIN,
                is_active=True,
            ).exists()
        )
        self.assertTrue(
            Membership.objects.filter(
                user__email="branch.admin.td@demo.pknk.vn",
                branch=self.branch_b,
                role=Membership.Role.BRANCH_ADMIN,
                is_active=True,
            ).exists()
        )
        legacy_membership.refresh_from_db()
        legacy_user.refresh_from_db()
        self.assertFalse(legacy_membership.is_active)
        self.assertFalse(legacy_user.is_active)

        command._seed_branch_admins(
            organization=self.organization,
            branches={"TD": self.branch_b},
            password="Demo123!",
        )

        removed_user = User.objects.get(email="branch.admin.q1@demo.pknk.vn")
        removed_membership = Membership.objects.get(
            user=removed_user,
            organization=self.organization,
            branch=self.branch_a,
            role=Membership.Role.BRANCH_ADMIN,
        )
        self.assertFalse(removed_user.is_active)
        self.assertFalse(removed_membership.is_active)
