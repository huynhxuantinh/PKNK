import threading
from datetime import timedelta

from django.core import mail
from django.db import DatabaseError, IntegrityError, connection, transaction
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from apps.accounts.models import User
from apps.locations.models import Branch, Province, Ward

from .models import Membership, Organization, StaffInvitation
from .services import (
    BranchAdminConflict,
    StaffInvitationService,
    StaffRoleConflict,
)
from .tasks import archive_expired_staff_invitations, send_staff_invitation_email


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


class StaffInvitationEmailTaskTests(TestCase):
    def setUp(self):
        province = Province.objects.create(code="79", name="HCM", full_name="HCM")
        ward = Ward.objects.create(
            code="00001", province=province, name="Ward", full_name="Ward"
        )
        self.organization = Organization.objects.create(
            name="Invitation Email Org", slug="invitation-email-org"
        )
        self.branch = Branch.objects.create(
            organization=self.organization,
            code="IE1",
            name="IE1",
            province=province,
            ward=ward,
            address_line="IE1",
            location="POINT(106.7 10.7)",
        )
        self.inviter = User.objects.create_user(
            email="invitation-email-admin@example.com",
            password="StrongPassword!2026",
            full_name="Inviter",
        )
        self.invitation, self.raw_token = StaffInvitationService.create(
            organization=self.organization,
            branch=self.branch,
            email="invitation-email-recipient@example.com",
            role=Membership.Role.BRANCH_ADMIN,
            invited_by=self.inviter,
        )

    def send_email(self, raw_token=None):
        send_staff_invitation_email.apply(
            args=(self.invitation.pk, raw_token or self.raw_token)
        )
        self.invitation.refresh_from_db()

    def assert_skipped(self):
        self.assertEqual(mail.outbox, [])
        self.assertEqual(
            self.invitation.email_delivery_status,
            StaffInvitation.EmailDeliveryStatus.PENDING,
        )

    def test_sends_still_valid_invitation(self):
        self.send_email()

        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(
            self.invitation.email_delivery_status,
            StaffInvitation.EmailDeliveryStatus.SENT,
        )
        self.assertIsNotNone(self.invitation.email_sent_at)

    def test_skips_revoked_invitation(self):
        StaffInvitation.objects.filter(pk=self.invitation.pk).update(
            revoked_at=timezone.now()
        )

        self.send_email()

        self.assert_skipped()

    def test_skips_accepted_invitation(self):
        StaffInvitation.objects.filter(pk=self.invitation.pk).update(
            accepted_at=timezone.now()
        )

        self.send_email()

        self.assert_skipped()

    def test_skips_expired_invitation(self):
        StaffInvitation.objects.filter(pk=self.invitation.pk).update(
            expires_at=timezone.now() - timedelta(minutes=1)
        )

        self.send_email()

        self.assert_skipped()

    def test_skips_invitation_for_inactive_branch(self):
        Branch.objects.filter(pk=self.branch.pk).update(is_active=False)

        self.send_email()

        self.assert_skipped()

    def test_skips_invitation_when_token_no_longer_matches(self):
        self.send_email(raw_token="outdated-token")

        self.assert_skipped()


class StaffInvitationConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        province = Province.objects.create(code="79", name="HCM", full_name="HCM")
        ward = Ward.objects.create(
            code="00001", province=province, name="Ward", full_name="Ward"
        )
        self.organization = Organization.objects.create(
            name="Concurrent Org", slug="concurrent-invite-org"
        )
        self.branch = Branch.objects.create(
            organization=self.organization,
            code="CI1",
            name="CI1",
            province=province,
            ward=ward,
            address_line="CI1",
            location="POINT(106.7 10.7)",
        )
        self.inviter = User.objects.create_user(
            email="concurrent-inviter@example.com",
            password="test",
            full_name="Concurrent Inviter",
        )
        self.user = User.objects.create_user(
            email="concurrent-invitee@example.com",
            password="StrongPassword!2026",
            full_name="Concurrent Invitee",
            email_verified_at=timezone.now(),
        )
        _, self.organization_admin_token = StaffInvitationService.create(
            organization=self.organization,
            branch=None,
            email=self.user.email,
            role=Membership.Role.ORGANIZATION_ADMIN,
            invited_by=self.inviter,
        )
        _, self.branch_admin_token = StaffInvitationService.create(
            organization=self.organization,
            branch=self.branch,
            email=self.user.email,
            role=Membership.Role.BRANCH_ADMIN,
            invited_by=self.inviter,
        )

    def test_concurrent_acceptance_grants_only_one_staff_role(self):
        barrier = threading.Barrier(2)
        outcomes = []
        conflicts = []
        outcomes_lock = threading.Lock()

        def accept(token):
            try:
                barrier.wait(timeout=10)
                membership, _ = StaffInvitationService.accept(
                    raw_token=token, user=self.user
                )
                with outcomes_lock:
                    outcomes.append(membership.role)
            except (StaffRoleConflict, BranchAdminConflict) as error:
                with outcomes_lock:
                    conflicts.append(str(error))
            finally:
                connection.close()

        threads = [
            threading.Thread(target=accept, args=(token,))
            for token in (self.organization_admin_token, self.branch_admin_token)
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)

        self.assertFalse(any(thread.is_alive() for thread in threads))
        self.assertEqual(len(outcomes), 1)
        self.assertEqual(len(conflicts), 1)
        active_roles = list(
            Membership.objects.filter(user=self.user, is_active=True).values_list(
                "role", flat=True
            )
        )
        self.assertEqual(active_roles, outcomes)
