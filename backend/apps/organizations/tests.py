from django.db import DatabaseError, IntegrityError, transaction
from django.test import TestCase

from apps.accounts.models import User
from apps.locations.models import Branch, Province, Ward

from .models import Membership, Organization


class OrganizationModelTests(TestCase):
    def test_slot_hold_minutes_must_be_in_valid_range(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Organization.objects.create(
                name="Chuỗi thử nghiệm",
                slug="chuoi-thu-nghiem",
                slot_hold_minutes=0,
            )

    def test_database_rejects_membership_branch_from_another_organization(self):
        province = Province.objects.create(code="79", name="HCM", full_name="HCM")
        ward = Ward.objects.create(
            code="00001", province=province, name="Ward", full_name="Ward"
        )
        org_a = Organization.objects.create(name="Org A", slug="membership-org-a")
        org_b = Organization.objects.create(name="Org B", slug="membership-org-b")
        branch_b = Branch.objects.create(
            organization=org_b,
            code="B1",
            name="B1",
            province=province,
            ward=ward,
            address_line="B1",
            location="POINT(106.7 10.7)",
        )
        user = User.objects.create_user(
            email="invalid-scope@example.com", password="test", full_name="Invalid"
        )

        with self.assertRaises(DatabaseError), transaction.atomic():
            Membership.objects.create(
                user=user,
                organization=org_a,
                branch=branch_b,
                role=Membership.Role.BRANCH_ADMIN,
            )
