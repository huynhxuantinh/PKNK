from django.test import TestCase

from apps.accounts.models import User
from apps.locations.models import Branch, Province, Ward
from apps.organizations.models import Membership, Organization

from .scopes import branch_ids_for, organization_ids_for


class AccessScopeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        province = Province.objects.create(code="79", name="HCM", full_name="HCM")
        ward = Ward.objects.create(
            code="00001", province=province, name="Ward", full_name="Ward"
        )
        cls.org_a = Organization.objects.create(name="Org A", slug="org-a")
        cls.org_b = Organization.objects.create(name="Org B", slug="org-b")
        cls.branch_a1 = Branch.objects.create(
            organization=cls.org_a,
            code="A1",
            name="A1",
            province=province,
            ward=ward,
            address_line="A1",
            location="POINT(106.7 10.7)",
        )
        cls.branch_a2 = Branch.objects.create(
            organization=cls.org_a,
            code="A2",
            name="A2",
            province=province,
            ward=ward,
            address_line="A2",
            location="POINT(106.8 10.8)",
        )
        cls.branch_b = Branch.objects.create(
            organization=cls.org_b,
            code="B1",
            name="B1",
            province=province,
            ward=ward,
            address_line="B1",
            location="POINT(106.9 10.9)",
        )

    def create_user(self, email):
        return User.objects.create_user(email=email, password="test", full_name=email)

    def test_organization_admin_inherits_all_branches_only_in_organization(self):
        user = self.create_user("org-admin@example.com")
        Membership.objects.create(
            user=user,
            organization=self.org_a,
            role=Membership.Role.ORGANIZATION_ADMIN,
        )

        organization_ids = set(
            organization_ids_for(user, [Membership.Role.ORGANIZATION_ADMIN])
        )
        branch_ids = set(
            branch_ids_for(
                user,
                [
                    Membership.Role.ORGANIZATION_ADMIN,
                    Membership.Role.BRANCH_ADMIN,
                ],
            )
        )

        self.assertEqual(organization_ids, {self.org_a.pk})
        self.assertEqual(branch_ids, {self.branch_a1.pk, self.branch_a2.pk})

    def test_branch_admin_scope_is_exactly_one_branch(self):
        user = self.create_user("branch-admin@example.com")
        Membership.objects.create(
            user=user,
            organization=self.org_a,
            branch=self.branch_a1,
            role=Membership.Role.BRANCH_ADMIN,
        )

        branch_ids = set(
            branch_ids_for(user, [Membership.Role.BRANCH_ADMIN])
        )

        self.assertEqual(branch_ids, {self.branch_a1.pk})
        self.assertNotIn(self.branch_a2.pk, branch_ids)

    def test_inactive_membership_and_inactive_organization_grant_no_access(self):
        user = self.create_user("inactive@example.com")
        Membership.objects.create(
            user=user,
            organization=self.org_a,
            branch=self.branch_a1,
            role=Membership.Role.BRANCH_ADMIN,
            is_active=False,
        )
        Membership.objects.create(
            user=user,
            organization=self.org_b,
            role=Membership.Role.ORGANIZATION_ADMIN,
        )
        self.org_b.is_active = False
        self.org_b.save(update_fields=["is_active", "updated_at"])

        self.assertFalse(branch_ids_for(user, [Membership.Role.BRANCH_ADMIN]).exists())
        self.assertFalse(
            organization_ids_for(user, [Membership.Role.ORGANIZATION_ADMIN]).exists()
        )

