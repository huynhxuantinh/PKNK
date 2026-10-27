from datetime import timedelta

from django.db import DatabaseError, IntegrityError, transaction
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.accounts.models import User
from apps.locations.models import Branch, Province, Ward

from .models import Membership, Organization, StaffInvitation
from .tasks import archive_expired_staff_invitations


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

    def test_database_allows_one_active_branch_admin_per_user_and_branch(self):
        province = Province.objects.create(code="79", name="HCM", full_name="HCM")
        ward = Ward.objects.create(
            code="00001", province=province, name="Ward", full_name="Ward"
        )
        organization = Organization.objects.create(
            name="Org", slug="one-branch-admin-org"
        )
        branch_a = Branch.objects.create(
            organization=organization,
            code="A1",
            name="A1",
            province=province,
            ward=ward,
            address_line="A1",
            location="POINT(106.7 10.7)",
        )
        branch_b = Branch.objects.create(
            organization=organization,
            code="B1",
            name="B1",
            province=province,
            ward=ward,
            address_line="B1",
            location="POINT(106.8 10.8)",
        )
        first_user = User.objects.create_user(
            email="branch-manager-one@example.com",
            password="test",
            full_name="Manager One",
        )
        second_user = User.objects.create_user(
            email="branch-manager-two@example.com",
            password="test",
            full_name="Manager Two",
        )
        first_membership = Membership.objects.create(
            user=first_user,
            organization=organization,
            branch=branch_a,
            role=Membership.Role.BRANCH_ADMIN,
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            Membership.objects.create(
                user=first_user,
                organization=organization,
                branch=branch_b,
                role=Membership.Role.BRANCH_ADMIN,
            )
        with self.assertRaises(IntegrityError), transaction.atomic():
            Membership.objects.create(
                user=second_user,
                organization=organization,
                branch=branch_a,
                role=Membership.Role.BRANCH_ADMIN,
            )

        first_membership.is_active = False
        first_membership.save(update_fields=["is_active"])
        Membership.objects.create(
            user=first_user,
            organization=organization,
            branch=branch_b,
            role=Membership.Role.BRANCH_ADMIN,
        )
        self.assertTrue(
            Membership.objects.filter(
                user=first_user,
                branch=branch_b,
                role=Membership.Role.BRANCH_ADMIN,
                is_active=True,
            ).exists()
        )


class StaffInvitationCleanupTaskTests(TestCase):
    @override_settings(STAFF_INVITATION_RETENTION_DAYS=30)
    def test_archives_only_unresolved_invitations_expired_over_retention_period(self):
        organization = Organization.objects.create(
            name="Cleanup Org", slug="cleanup-org"
        )
        inviter = User.objects.create_user(
            email="cleanup-owner@example.com",
            password="test",
            full_name="Cleanup Owner",
        )
        now = timezone.now()

        stale = StaffInvitation.objects.create(
            organization=organization,
            email="stale@example.com",
            role=Membership.Role.ORGANIZATION_ADMIN,
            token_digest="a" * 64,
            invited_by=inviter,
            expires_at=now - timedelta(days=31),
        )
        recent = StaffInvitation.objects.create(
            organization=organization,
            email="recent@example.com",
            role=Membership.Role.ORGANIZATION_ADMIN,
            token_digest="b" * 64,
            invited_by=inviter,
            expires_at=now - timedelta(days=29),
        )
        accepted = StaffInvitation.objects.create(
            organization=organization,
            email="accepted@example.com",
            role=Membership.Role.ORGANIZATION_ADMIN,
            token_digest="c" * 64,
            invited_by=inviter,
            expires_at=now - timedelta(days=31),
            accepted_at=now - timedelta(days=30),
        )

        archived_count = archive_expired_staff_invitations()

        self.assertEqual(archived_count, 1)
        stale.refresh_from_db()
        recent.refresh_from_db()
        accepted.refresh_from_db()
        self.assertIsNotNone(stale.revoked_at)
        self.assertIsNone(recent.revoked_at)
        self.assertIsNone(accepted.revoked_at)
