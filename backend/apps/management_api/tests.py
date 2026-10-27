import hashlib
import sys
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from django.core import mail
from django.db import IntegrityError
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Dentist, PatientProfile, User
from apps.audit.models import AuditEvent
from apps.catalog.models import BranchService, DentistService, Service
from apps.locations.models import Branch, Chair, Province, Ward
from apps.organizations.models import Membership, Organization, StaffInvitation
from apps.organizations.services import StaffInvitationService
from apps.organizations.tasks import StaffInvitationEmailTask
from apps.scheduling.models import Appointment


class ManagementAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.province = Province.objects.create(code="79", name="HCM", full_name="HCM")
        cls.ward = Ward.objects.create(
            code="00001", province=cls.province, name="Ward", full_name="Ward"
        )
        cls.org_a = Organization.objects.create(name="Org A", slug="manage-org-a")
        cls.org_b = Organization.objects.create(name="Org B", slug="manage-org-b")
        cls.branch_a = cls.make_branch(cls.org_a, "A1")
        cls.branch_b = cls.make_branch(cls.org_b, "B1")
        cls.org_admin = cls.make_user("org-admin-manage@example.com")
        cls.branch_admin = cls.make_user("branch-admin-manage@example.com")
        cls.other_admin = cls.make_user("other-admin-manage@example.com")
        cls.staff_user = cls.make_user("staff-manage@example.com")
        cls.dentist_user = cls.make_user("dentist-manage@example.com")
        cls.org_admin_membership = Membership.objects.create(
            user=cls.org_admin,
            organization=cls.org_a,
            role=Membership.Role.ORGANIZATION_ADMIN,
        )
        Membership.objects.create(
            user=cls.branch_admin,
            organization=cls.org_a,
            branch=cls.branch_a,
            role=Membership.Role.BRANCH_ADMIN,
        )
        Membership.objects.create(
            user=cls.other_admin,
            organization=cls.org_b,
            role=Membership.Role.ORGANIZATION_ADMIN,
        )

    @classmethod
    def make_user(cls, email):
        return User.objects.create_user(
            email=email,
            password="StrongPassword!2026",
            full_name=email,
            email_verified_at=timezone.now(),
        )

    @classmethod
    def make_branch(cls, organization, code):
        return Branch.objects.create(
            organization=organization,
            code=code,
            name=code,
            province=cls.province,
            ward=cls.ward,
            address_line=code,
            location="POINT(106.7 10.7)",
        )

    def create_active_patient_appointment(self, user, public_code):
        patient = PatientProfile.objects.create(user=user)
        Membership.objects.create(
            user=user,
            organization=self.org_a,
            role=Membership.Role.PATIENT,
        )
        dentist = Dentist.objects.create(
            user=self.dentist_user,
            organization=self.org_a,
        )
        service = Service.objects.create(
            organization=self.org_a,
            code=f"SVC-{public_code}",
            name="Khám tổng quát",
            standard_duration_minutes=30,
            standard_price=100,
        )
        branch_service = BranchService.objects.create(
            branch=self.branch_a,
            service=service,
            price=100,
        )
        chair = Chair.objects.create(
            branch=self.branch_a,
            code=f"C-{public_code}",
            name="Ghế khám",
            resource_type=Chair.ResourceType.CHAIR,
        )
        starts_at = timezone.now() + timedelta(days=1)
        return Appointment.objects.create(
            public_code=public_code,
            patient_profile=patient,
            branch=self.branch_a,
            branch_service=branch_service,
            dentist=dentist,
            chair=chair,
            service_name_snapshot=service.name,
            service_price_snapshot=branch_service.price,
            duration_minutes=30,
            starts_at=starts_at,
            ends_at=starts_at + timedelta(minutes=30),
            occupied_until=starts_at + timedelta(minutes=30),
            status=Appointment.Status.CONFIRMED,
        )

    def test_branch_scope_and_branch_admin_cannot_patch_branch(self):
        self.client.force_authenticate(self.branch_admin)

        own = self.client.get(reverse("management:branch-detail", kwargs={"branch_id": self.branch_a.pk}))
        cross = self.client.get(reverse("management:branch-detail", kwargs={"branch_id": self.branch_b.pk}))
        patch = self.client.patch(
            reverse("management:branch-detail", kwargs={"branch_id": self.branch_a.pk}),
            {"name": "Not allowed"},
            format="json",
        )

        self.assertEqual(own.status_code, status.HTTP_200_OK)
        self.assertEqual(cross.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(patch.status_code, status.HTTP_404_NOT_FOUND)

    def test_patient_cannot_access_management_api(self):
        patient = self.make_user("patient-no-management@example.com")
        PatientProfile.objects.create(user=patient)
        Membership.objects.create(
            user=patient,
            organization=self.org_a,
            role=Membership.Role.PATIENT,
        )
        self.client.force_authenticate(patient)

        response = self.client.get(
            reverse("management:branch-detail", kwargs={"branch_id": self.branch_a.pk})
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_org_admin_creates_branch_and_audit_event(self):
        self.client.force_authenticate(self.org_admin)
        response = self.client.post(
            reverse("management:organization-branches", kwargs={"organization_id": self.org_a.pk}),
            {
                "code": "A2",
                "name": "Branch A2",
                "province_code": self.province.pk,
                "ward_code": self.ward.pk,
                "address_line": "A2",
                "latitude": 10.8,
                "longitude": 106.8,
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        branch = Branch.objects.get(code="A2")
        self.assertEqual(branch.organization, self.org_a)
        self.assertTrue(AuditEvent.objects.filter(action="BRANCH_CREATED", resource_id=str(branch.pk)).exists())

    def test_branch_admin_manages_chair_only_in_assigned_branch(self):
        self.client.force_authenticate(self.branch_admin)
        own = self.client.post(
            reverse("management:branch-chairs", kwargs={"branch_id": self.branch_a.pk}),
            {"code": "C1", "name": "Chair 1", "resource_type": "CHAIR"},
            format="json",
        )
        cross = self.client.post(
            reverse("management:branch-chairs", kwargs={"branch_id": self.branch_b.pk}),
            {"code": "C2", "name": "Chair 2", "resource_type": "CHAIR"},
            format="json",
        )

        self.assertEqual(own.status_code, status.HTTP_201_CREATED)
        self.assertEqual(cross.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Chair.objects.filter(branch=self.branch_a, code="C1").exists())

    def test_service_and_branch_price_workflow(self):
        self.client.force_authenticate(self.org_admin)
        service_response = self.client.post(
            reverse("management:organization-services", kwargs={"organization_id": self.org_a.pk}),
            {
                "code": "IMPLANT",
                "name": "Implant",
                "standard_duration_minutes": 60,
                "buffer_minutes": 10,
                "standard_price": "10000000",
            },
            format="json",
        )
        service_id = service_response.data["data"]["id_service"]
        self.client.force_authenticate(self.branch_admin)
        price_response = self.client.post(
            reverse("management:branch-services", kwargs={"branch_id": self.branch_a.pk}),
            {"service_id": service_id, "price": "9000000", "is_active": True},
            format="json",
        )

        self.assertEqual(service_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(price_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(BranchService.objects.get().price, Decimal("9000000"))

    def test_branch_admin_cannot_attach_service_from_other_organization(self):
        foreign_service = Service.objects.create(
            organization=self.org_b,
            code="FOREIGN",
            name="Foreign",
            standard_duration_minutes=30,
            standard_price=100,
        )
        self.client.force_authenticate(self.branch_admin)

        response = self.client.post(
            reverse("management:branch-services", kwargs={"branch_id": self.branch_a.pk}),
            {"service_id": foreign_service.pk, "price": "100"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(BranchService.objects.exists())

    def test_membership_list_only_returns_admin_roles(self):
        Membership.objects.create(
            user=self.staff_user,
            organization=self.org_a,
            role=Membership.Role.PATIENT,
        )
        self.client.force_authenticate(self.org_admin)

        response = self.client.get(
            reverse("management:organization-memberships", kwargs={"organization_id": self.org_a.pk}),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["data"]
        self.assertEqual(
            {row["role"] for row in rows},
            {Membership.Role.ORGANIZATION_ADMIN, Membership.Role.BRANCH_ADMIN},
        )
        self.assertNotIn(
            self.staff_user.email,
            {row["user_email"] for row in rows},
        )

    def assign_branch_admin(self, email, branch):
        return self.client.post(
            reverse(
                "management:organization-memberships",
                kwargs={"organization_id": self.org_a.pk},
            ),
            {
                "email": email,
                "role": Membership.Role.BRANCH_ADMIN,
                "branch_id": branch.pk,
            },
            format="json",
        )

    def test_cannot_assign_second_branch_to_same_branch_admin(self):
        first_branch = self.make_branch(self.org_a, "SECOND1")
        second_branch = self.make_branch(self.org_a, "SECOND2")
        Membership.objects.create(
            user=self.staff_user,
            organization=self.org_a,
            branch=first_branch,
            role=Membership.Role.BRANCH_ADMIN,
        )
        self.client.force_authenticate(self.org_admin)

        second = self.assign_branch_admin(self.staff_user.email, second_branch)

        self.assertEqual(second.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("quản lý chi nhánh khác", second.data["message"])
        self.assertFalse(
            Membership.objects.filter(
                user=self.staff_user,
                branch=second_branch,
                role=Membership.Role.BRANCH_ADMIN,
            ).exists()
        )

    def test_cannot_assign_second_manager_to_same_branch(self):
        self.client.force_authenticate(self.org_admin)

        response = self.assign_branch_admin(self.staff_user.email, self.branch_a)

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("Chi nhánh này đã có quản lý", response.data["message"])

    def test_patch_branch_and_reactivation_enforce_one_branch_rule(self):
        first_branch = self.make_branch(self.org_a, "PATCH1")
        second_branch = self.make_branch(self.org_a, "PATCH2")
        reactivate_branch = self.make_branch(self.org_a, "PATCH3")
        membership = Membership.objects.create(
            user=self.staff_user,
            organization=self.org_a,
            branch=first_branch,
            role=Membership.Role.BRANCH_ADMIN,
        )
        self.client.force_authenticate(self.org_admin)

        conflict_branch = self.client.patch(
            reverse("management:membership-detail", kwargs={"membership_id": membership.pk}),
            {"branch_id": self.branch_a.pk},
            format="json",
        )
        transfer = self.client.patch(
            reverse("management:membership-detail", kwargs={"membership_id": membership.pk}),
            {"branch_id": second_branch.pk},
            format="json",
        )
        self.assertEqual(conflict_branch.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("Chi nhánh này đã có quản lý", conflict_branch.data["message"])
        self.assertEqual(transfer.status_code, status.HTTP_200_OK)
        self.assertEqual(transfer.data["data"]["branch_id"], second_branch.pk)

        inactive_membership = Membership.objects.create(
            user=self.staff_user,
            organization=self.org_a,
            branch=reactivate_branch,
            role=Membership.Role.BRANCH_ADMIN,
            is_active=False,
        )
        reactivation = self.client.patch(
            reverse(
                "management:membership-detail",
                kwargs={"membership_id": inactive_membership.pk},
            ),
            {"is_active": True},
            format="json",
        )
        self.assertEqual(reactivation.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("quản lý chi nhánh khác", reactivation.data["message"])
        inactive_membership.refresh_from_db()
        self.assertFalse(inactive_membership.is_active)

    @patch("apps.management_api.views.MembershipManagementSerializer.save")
    def test_patch_branch_admin_converts_database_race_to_conflict(self, save):
        free_branch = self.make_branch(self.org_a, "RACE-PATCH")
        inactive_membership = Membership.objects.create(
            user=self.staff_user,
            organization=self.org_a,
            branch=free_branch,
            role=Membership.Role.BRANCH_ADMIN,
            is_active=False,
        )
        save.side_effect = IntegrityError("duplicate branch manager")
        self.client.force_authenticate(self.org_admin)

        response = self.client.patch(
            reverse(
                "management:membership-detail",
                kwargs={"membership_id": inactive_membership.pk},
            ),
            {"is_active": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("dữ liệu vừa thay đổi", response.data["message"])

    def test_patch_role_to_branch_admin_respects_branch_manager(self):
        membership = Membership.objects.create(
            user=self.staff_user,
            organization=self.org_a,
            role=Membership.Role.ORGANIZATION_ADMIN,
        )
        self.client.force_authenticate(self.org_admin)

        response = self.client.patch(
            reverse(
                "management:membership-detail",
                kwargs={"membership_id": membership.pk},
            ),
            {
                "role": Membership.Role.BRANCH_ADMIN,
                "branch_id": self.branch_a.pk,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("Chi nhánh này đã có quản lý", response.data["message"])
        membership.refresh_from_db()
        self.assertEqual(membership.role, Membership.Role.ORGANIZATION_ADMIN)

    def test_reactivation_is_blocked_when_branch_already_has_manager(self):
        managed_branch = self.make_branch(self.org_a, "REACT1")
        other_manager = self.make_user("reactivation-manager@example.com")
        Membership.objects.create(
            user=other_manager,
            organization=self.org_a,
            branch=managed_branch,
            role=Membership.Role.BRANCH_ADMIN,
        )
        inactive_membership = Membership.objects.create(
            user=self.staff_user,
            organization=self.org_a,
            branch=managed_branch,
            role=Membership.Role.BRANCH_ADMIN,
            is_active=False,
        )
        self.client.force_authenticate(self.org_admin)

        response = self.client.patch(
            reverse(
                "management:membership-detail",
                kwargs={"membership_id": inactive_membership.pk},
            ),
            {"is_active": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("Chi nhánh này đã có quản lý", response.data["message"])

    def test_branch_admin_invitation_rejects_managed_branch_and_existing_manager(self):
        free_branch = self.make_branch(self.org_a, "INVITE1")
        self.client.force_authenticate(self.org_admin)

        managed_branch = self.assign_branch_admin(
            "new-manager-managed-branch@example.com",
            self.branch_a,
        )
        existing_manager = self.assign_branch_admin(
            self.branch_admin.email,
            free_branch,
        )

        self.assertEqual(managed_branch.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("Chi nhánh này đã có quản lý", managed_branch.data["message"])
        self.assertEqual(existing_manager.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("quản lý chi nhánh khác", existing_manager.data["message"])
        self.assertFalse(
            StaffInvitation.objects.filter(email__iexact=self.branch_admin.email).exists()
        )

    def test_invitation_accept_rechecks_branch_manager_rule(self):
        free_branch = self.make_branch(self.org_a, "INVITE2")
        invite_email = "late-branch-manager@example.com"
        invitation, raw_token = StaffInvitationService.create(
            organization=self.org_a,
            branch=free_branch,
            email=invite_email,
            role=Membership.Role.BRANCH_ADMIN,
            invited_by=self.org_admin,
        )
        replacement = self.make_user("replacement-branch-manager@example.com")
        Membership.objects.create(
            user=replacement,
            organization=self.org_a,
            branch=free_branch,
            role=Membership.Role.BRANCH_ADMIN,
        )
        invited_user = self.make_user(invite_email)
        self.client.force_authenticate(invited_user)

        response = self.client.post(
            reverse("management:invitation-accept"),
            {"token": raw_token},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("Chi nhánh này đã có quản lý", response.data["message"])
        invitation.refresh_from_db()
        self.assertIsNone(invitation.accepted_at)
        self.assertFalse(
            Membership.objects.filter(user=invited_user, is_active=True).exists()
        )

    @patch("apps.organizations.services.Membership.objects.update_or_create")
    def test_invitation_accept_converts_database_race_to_conflict(self, update_or_create):
        free_branch = self.make_branch(self.org_a, "RACE-INVITE")
        invite_email = "race-invitation@example.com"
        _invitation, raw_token = StaffInvitationService.create(
            organization=self.org_a,
            branch=free_branch,
            email=invite_email,
            role=Membership.Role.BRANCH_ADMIN,
            invited_by=self.org_admin,
        )
        invited_user = self.make_user(invite_email)
        update_or_create.side_effect = IntegrityError("duplicate branch manager")
        self.client.force_authenticate(invited_user)

        response = self.client.post(
            reverse("management:invitation-accept"),
            {"token": raw_token},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("dữ liệu vừa thay đổi", response.data["message"])

    def test_invitation_accept_rejects_inactive_branch(self):
        free_branch = self.make_branch(self.org_a, "INVINACTIVE")
        invite_email = "inactive-branch-manager@example.com"
        invitation, raw_token = StaffInvitationService.create(
            organization=self.org_a,
            branch=free_branch,
            email=invite_email,
            role=Membership.Role.BRANCH_ADMIN,
            invited_by=self.org_admin,
        )
        Branch.objects.filter(pk=free_branch.pk).update(is_active=False)
        invited_user = self.make_user(invite_email)
        self.client.force_authenticate(invited_user)

        response = self.client.post(
            reverse("management:invitation-accept"),
            {"token": raw_token},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        invitation.refresh_from_db()
        self.assertIsNone(invitation.accepted_at)
        self.assertFalse(
            Membership.objects.filter(user=invited_user, is_active=True).exists()
        )

    def test_organization_invitation_list_includes_expired(self):
        free_branch = self.make_branch(self.org_a, "INVLIST")
        pending, _ = StaffInvitationService.create(
            organization=self.org_a,
            branch=free_branch,
            email="pending-manager@example.com",
            role=Membership.Role.BRANCH_ADMIN,
            invited_by=self.org_admin,
        )
        expired, _ = StaffInvitationService.create(
            organization=self.org_a,
            branch=None,
            email="expired-admin@example.com",
            role=Membership.Role.ORGANIZATION_ADMIN,
            invited_by=self.org_admin,
        )
        StaffInvitation.objects.filter(pk=expired.pk).update(
            expires_at=timezone.now() - timedelta(minutes=1)
        )
        self.client.force_authenticate(self.org_admin)

        response = self.client.get(
            reverse(
                "management:organization-invitations",
                kwargs={"organization_id": self.org_a.pk},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["data"]
        self.assertEqual(
            [row["id_staff_invitation"] for row in rows],
            [pending.pk, expired.pk],
        )
        self.assertEqual(rows[0]["email"], "pending-manager@example.com")
        self.assertEqual(rows[0]["role"], Membership.Role.BRANCH_ADMIN)
        self.assertEqual(rows[0]["status"], "PENDING")
        self.assertEqual(rows[0]["branch_name"], free_branch.name)
        self.assertEqual(rows[1]["email"], "expired-admin@example.com")
        self.assertEqual(rows[1]["status"], "EXPIRED")

    def test_revoke_pending_invitation_blocks_acceptance(self):
        free_branch = self.make_branch(self.org_a, "INVREVOKE")
        invitation, raw_token = StaffInvitationService.create(
            organization=self.org_a,
            branch=free_branch,
            email="revoked-invitee@example.com",
            role=Membership.Role.BRANCH_ADMIN,
            invited_by=self.org_admin,
        )
        invited_user = self.make_user("revoked-invitee@example.com")
        self.client.force_authenticate(self.org_admin)

        response = self.client.delete(
            reverse(
                "management:staff-invitation-detail",
                kwargs={"invitation_id": invitation.pk},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        invitation.refresh_from_db()
        self.assertIsNotNone(invitation.revoked_at)
        self.assertTrue(
            AuditEvent.objects.filter(
                action="STAFF_INVITATION_REVOKED",
                resource_id=str(invitation.pk),
            ).exists()
        )
        listing = self.client.get(
            reverse(
                "management:organization-invitations",
                kwargs={"organization_id": self.org_a.pk},
            )
        )
        self.assertEqual(listing.data["data"], [])

        self.client.force_authenticate(invited_user)
        accept = self.client.post(
            reverse("management:invitation-accept"),
            {"token": raw_token},
            format="json",
        )
        self.assertEqual(accept.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            Membership.objects.filter(user=invited_user, is_active=True).exists()
        )

    def test_revoke_expired_invitation_hides_it_from_list(self):
        invitation, _ = StaffInvitationService.create(
            organization=self.org_a,
            branch=None,
            email="expired-hidden@example.com",
            role=Membership.Role.ORGANIZATION_ADMIN,
            invited_by=self.org_admin,
        )
        StaffInvitation.objects.filter(pk=invitation.pk).update(
            expires_at=timezone.now() - timedelta(minutes=1)
        )
        self.client.force_authenticate(self.org_admin)

        response = self.client.delete(
            reverse(
                "management:staff-invitation-detail",
                kwargs={"invitation_id": invitation.pk},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        invitation.refresh_from_db()
        self.assertIsNotNone(invitation.revoked_at)
        listing = self.client.get(
            reverse(
                "management:organization-invitations",
                kwargs={"organization_id": self.org_a.pk},
            )
        )
        self.assertEqual(listing.data["data"], [])

    def test_revoke_invitation_requires_same_organization(self):
        invitation, _ = StaffInvitationService.create(
            organization=self.org_b,
            branch=None,
            email="org-b-invite@example.com",
            role=Membership.Role.ORGANIZATION_ADMIN,
            invited_by=self.other_admin,
        )
        self.client.force_authenticate(self.org_admin)

        response = self.client.delete(
            reverse(
                "management:staff-invitation-detail",
                kwargs={"invitation_id": invitation.pk},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        invitation.refresh_from_db()
        self.assertIsNone(invitation.revoked_at)

    def test_revoke_accepted_invitation_returns_conflict(self):
        invitation, raw_token = StaffInvitationService.create(
            organization=self.org_a,
            branch=None,
            email="accepted-admin@example.com",
            role=Membership.Role.ORGANIZATION_ADMIN,
            invited_by=self.org_admin,
        )
        accepted_user = self.make_user("accepted-admin@example.com")
        StaffInvitationService.accept(raw_token=raw_token, user=accepted_user)
        self.client.force_authenticate(self.org_admin)

        response = self.client.delete(
            reverse(
                "management:staff-invitation-detail",
                kwargs={"invitation_id": invitation.pk},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("không còn ở trạng thái chờ", response.data["message"])

    def test_branch_manager_cannot_list_organization_invitations(self):
        self.client.force_authenticate(self.branch_admin)

        response = self.client.get(
            reverse(
                "management:organization-invitations",
                kwargs={"organization_id": self.org_a.pk},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_branch_admin_role_cannot_mix_with_organization_admin_or_dentist(self):
        dentist_branch = self.make_branch(self.org_a, "ROLE1")
        free_branch = self.make_branch(self.org_a, "ROLE2")
        Dentist.objects.create(user=self.staff_user, organization=self.org_a)
        Membership.objects.create(
            user=self.staff_user,
            organization=self.org_a,
            branch=dentist_branch,
            role=Membership.Role.DENTIST,
        )
        self.client.force_authenticate(self.org_admin)

        as_branch_admin = self.assign_branch_admin(self.staff_user.email, free_branch)
        as_organization_admin = self.client.post(
            reverse(
                "management:organization-memberships",
                kwargs={"organization_id": self.org_a.pk},
            ),
            {
                "email": self.branch_admin.email,
                "role": Membership.Role.ORGANIZATION_ADMIN,
            },
            format="json",
        )

        self.assertEqual(as_branch_admin.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("nha sĩ", as_branch_admin.data["message"])
        self.assertEqual(as_organization_admin.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("quản lý chi nhánh", as_organization_admin.data["message"])

    def test_branch_admin_cannot_be_assigned_as_dentist(self):
        Dentist.objects.create(user=self.branch_admin, organization=self.org_a)
        self.client.force_authenticate(self.org_admin)

        response = self.client.put(
            reverse(
                "management:dentist-branches",
                kwargs={"dentist_id": Dentist.objects.get(user=self.branch_admin).pk},
            ),
            {"ids": [self.branch_a.pk]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("quản lý chi nhánh", response.data["message"])

    def test_organization_admin_and_dentist_roles_cannot_be_combined(self):
        Dentist.objects.create(user=self.staff_user, organization=self.org_a)
        Membership.objects.create(
            user=self.staff_user,
            organization=self.org_a,
            branch=self.branch_a,
            role=Membership.Role.DENTIST,
        )
        second_org_admin = self.make_user("org-admin-dentist-conflict@example.com")
        Membership.objects.create(
            user=second_org_admin,
            organization=self.org_a,
            role=Membership.Role.ORGANIZATION_ADMIN,
        )
        second_admin_dentist = Dentist.objects.create(
            user=second_org_admin,
            organization=self.org_a,
        )
        self.client.force_authenticate(self.org_admin)

        dentist_to_admin = self.client.post(
            reverse(
                "management:organization-memberships",
                kwargs={"organization_id": self.org_a.pk},
            ),
            {
                "email": self.staff_user.email,
                "role": Membership.Role.ORGANIZATION_ADMIN,
            },
            format="json",
        )
        admin_to_dentist = self.client.put(
            reverse(
                "management:dentist-branches",
                kwargs={"dentist_id": second_admin_dentist.pk},
            ),
            {"ids": [self.branch_a.pk]},
            format="json",
        )

        self.assertEqual(dentist_to_admin.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("nha sĩ", dentist_to_admin.data["message"])
        self.assertEqual(admin_to_dentist.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("quản trị tổ chức", admin_to_dentist.data["message"])

    def test_organization_admin_and_dentist_memberships_are_not_limited(self):
        branch_two = self.make_branch(self.org_a, "ROLE3")
        second_org_admin = self.make_user("second-org-admin@example.com")
        dentist_user = self.make_user("multi-branch-dentist@example.com")
        Dentist.objects.create(user=dentist_user, organization=self.org_a)
        Membership.objects.create(
            user=second_org_admin,
            organization=self.org_a,
            role=Membership.Role.ORGANIZATION_ADMIN,
        )
        Membership.objects.create(
            user=dentist_user,
            organization=self.org_a,
            branch=self.branch_a,
            role=Membership.Role.DENTIST,
        )
        Membership.objects.create(
            user=dentist_user,
            organization=self.org_a,
            branch=branch_two,
            role=Membership.Role.DENTIST,
        )

        self.assertEqual(
            Membership.objects.filter(
                organization=self.org_a,
                role=Membership.Role.ORGANIZATION_ADMIN,
                is_active=True,
            ).count(),
            2,
        )
        self.assertEqual(
            Membership.objects.filter(
                user=dentist_user,
                role=Membership.Role.DENTIST,
                is_active=True,
            ).count(),
            2,
        )

    def test_existing_verified_user_must_accept_invitation_before_role_is_granted(self):
        free_branch = self.make_branch(self.org_a, "FREE1")
        PatientProfile.objects.create(user=self.staff_user)
        patient_membership = Membership.objects.create(
            user=self.staff_user,
            organization=self.org_a,
            role=Membership.Role.PATIENT,
        )
        self.client.force_authenticate(self.org_admin)

        response = self.client.post(
            reverse("management:organization-memberships", kwargs={"organization_id": self.org_a.pk}),
            {
                "email": self.staff_user.email,
                "role": Membership.Role.BRANCH_ADMIN,
                "branch_id": free_branch.pk,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(response.data["data"]["status"], "PENDING")
        self.assertFalse(Membership.objects.filter(user=self.staff_user, branch=free_branch).exists())
        self.assertTrue(
            Membership.objects.filter(
                user=self.staff_user,
                role=Membership.Role.PATIENT,
                is_active=True,
            ).exists()
        )
        self.assertFalse(
            AuditEvent.objects.filter(
                action="PATIENT_MEMBERSHIP_AUTO_DEACTIVATED",
                resource_id=str(patient_membership.pk),
            ).exists()
        )

    def test_cannot_assign_staff_role_while_patient_has_active_appointment(self):
        free_branch = self.make_branch(self.org_a, "FREE2")
        self.create_active_patient_appointment(
            self.staff_user,
            "APT-PATIENT-TO-STAFF",
        )
        self.client.force_authenticate(self.org_admin)

        response = self.client.post(
            reverse("management:organization-memberships", kwargs={"organization_id": self.org_a.pk}),
            {
                "email": self.staff_user.email,
                "role": Membership.Role.BRANCH_ADMIN,
                "branch_id": free_branch.pk,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertTrue(
            StaffInvitation.objects.filter(
                email__iexact=self.staff_user.email,
                branch=free_branch,
            ).exists()
        )
        self.assertTrue(
            Membership.objects.filter(
                user=self.staff_user,
                role=Membership.Role.PATIENT,
                is_active=True,
            ).exists()
        )
        self.assertFalse(
            Membership.objects.filter(
                user=self.staff_user,
                role=Membership.Role.BRANCH_ADMIN,
                is_active=True,
            ).exists()
        )

    def test_cannot_accept_staff_invitation_while_patient_has_active_appointment(self):
        free_branch = self.make_branch(self.org_a, "FREE3")
        invite_email = "patient-invited-as-staff@example.com"
        invitation, raw_token = StaffInvitationService.create(
            organization=self.org_a,
            branch=free_branch,
            email=invite_email,
            role=Membership.Role.BRANCH_ADMIN,
            invited_by=self.org_admin,
        )
        invited_user = self.make_user(invite_email)
        self.create_active_patient_appointment(
            invited_user,
            "APT-PATIENT-INVITED",
        )
        self.client.force_authenticate(invited_user)

        response = self.client.post(
            reverse("management:invitation-accept"),
            {"token": raw_token},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("lịch hẹn bệnh nhân", response.data["message"])
        invitation.refresh_from_db()
        self.assertIsNone(invitation.accepted_at)
        self.assertFalse(
            Membership.objects.filter(
                user=invited_user,
                role=Membership.Role.BRANCH_ADMIN,
                is_active=True,
            ).exists()
        )

    def test_cannot_reactivate_staff_role_while_patient_has_active_appointment(self):
        free_branch = self.make_branch(self.org_a, "FREE4")
        self.create_active_patient_appointment(
            self.staff_user,
            "APT-PATIENT-REACTIVATE",
        )
        staff_membership = Membership.objects.create(
            user=self.staff_user,
            organization=self.org_a,
            branch=free_branch,
            role=Membership.Role.BRANCH_ADMIN,
            is_active=False,
        )
        self.client.force_authenticate(self.org_admin)

        response = self.client.patch(
            reverse("management:membership-detail", kwargs={"membership_id": staff_membership.pk}),
            {"is_active": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        staff_membership.refresh_from_db()
        self.assertFalse(staff_membership.is_active)

    def test_cannot_assign_dentist_branch_while_patient_has_active_appointment(self):
        self.create_active_patient_appointment(
            self.staff_user,
            "APT-PATIENT-TO-DENTIST",
        )
        dentist = Dentist.objects.create(
            user=self.staff_user,
            organization=self.org_a,
        )
        self.client.force_authenticate(self.org_admin)

        response = self.client.put(
            reverse("management:dentist-branches", kwargs={"dentist_id": dentist.pk}),
            {"ids": [self.branch_a.pk]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertFalse(
            Membership.objects.filter(
                user=self.staff_user,
                role=Membership.Role.DENTIST,
                is_active=True,
            ).exists()
        )

    def test_invitation_token_is_emailed_hashed_and_single_use(self):
        free_branch = self.make_branch(self.org_a, "FREE5")
        invite_email = "new-branch-admin@example.com"
        self.client.force_authenticate(self.org_admin)
        with self.captureOnCommitCallbacks(execute=True):
            invite_response = self.client.post(
                reverse("management:organization-memberships", kwargs={"organization_id": self.org_a.pk}),
                {
                    "email": invite_email,
                    "role": Membership.Role.BRANCH_ADMIN,
                    "branch_id": free_branch.pk,
                },
                format="json",
            )
        invitation = StaffInvitation.objects.get(email=invite_email)
        invitation_email = mail.outbox[-1]
        raw_token = parse_qs(urlparse(invitation_email.body.splitlines()[-1]).query)["token"][0]
        invited_user = self.make_user(invite_email)
        self.client.force_authenticate(invited_user)
        first = self.client.post(
            reverse("management:invitation-accept"), {"token": raw_token}, format="json"
        )
        second = self.client.post(
            reverse("management:invitation-accept"), {"token": raw_token}, format="json"
        )

        self.assertEqual(invite_response.status_code, status.HTTP_202_ACCEPTED)
        self.assertIn(self.org_admin.full_name, invitation_email.body)
        self.assertIn("Quản lý chi nhánh", invitation_email.body)
        self.assertIn(f"tại {free_branch.name} của {self.org_a.name}", invitation_email.body)
        self.assertIn("Liên kết có hiệu lực đến", invitation_email.body)
        self.assertNotIn("Hãy đăng ký/xác minh", invitation_email.body)
        invitation.refresh_from_db()
        self.assertEqual(
            invitation.email_delivery_status,
            StaffInvitation.EmailDeliveryStatus.SENT,
        )
        self.assertIsNotNone(invitation.email_sent_at)
        self.assertEqual(invitation.token_digest, hashlib.sha256(raw_token.encode()).hexdigest())
        self.assertNotEqual(invitation.token_digest, raw_token)
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Membership.objects.filter(user=invited_user, branch=free_branch, is_active=True).exists())

    def test_invitation_email_records_final_delivery_failure(self):
        invitation, raw_token = StaffInvitationService.create(
            organization=self.org_a,
            branch=None,
            email="mail-failure@example.com",
            role=Membership.Role.ORGANIZATION_ADMIN,
            invited_by=self.org_admin,
        )

        error = RuntimeError("SMTP down")
        try:
            raise error
        except RuntimeError:
            exception_info = SimpleNamespace(exc_info=sys.exc_info())
        with self.assertLogs("apps.organizations.tasks", level="ERROR") as logs:
            StaffInvitationEmailTask().on_failure(
                error,
                "task-id",
                [invitation.pk, raw_token],
                {},
                exception_info,
            )

        invitation.refresh_from_db()
        self.assertEqual(
            invitation.email_delivery_status,
            StaffInvitation.EmailDeliveryStatus.FAILED,
        )
        self.assertIsNotNone(invitation.email_failed_at)
        self.assertTrue(
            any("thất bại sau khi retry" in message for message in logs.output)
        )

    @patch(
        "apps.management_api.views.send_staff_invitation_email.delay",
        side_effect=RuntimeError("Redis unavailable"),
    )
    def test_invitation_marks_email_failed_when_broker_enqueue_fails(self, _delay):
        free_branch = self.make_branch(self.org_a, "BROKER-FAIL")
        self.client.force_authenticate(self.org_admin)

        with self.assertLogs("apps.management_api.views", level="ERROR") as logs:
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post(
                    reverse(
                        "management:organization-memberships",
                        kwargs={"organization_id": self.org_a.pk},
                    ),
                    {
                        "email": "broker-failure@example.com",
                        "role": Membership.Role.BRANCH_ADMIN,
                        "branch_id": free_branch.pk,
                    },
                    format="json",
                )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        invitation = StaffInvitation.objects.get(email="broker-failure@example.com")
        self.assertEqual(
            invitation.email_delivery_status,
            StaffInvitation.EmailDeliveryStatus.FAILED,
        )
        self.assertIsNotNone(invitation.email_failed_at)
        self.assertTrue(
            any("Không thể đưa email mời nhân viên" in message for message in logs.output)
        )

    def test_new_user_accepts_invitation_and_creates_verified_staff_account(self):
        free_branch = self.make_branch(self.org_a, "FREE-NEW")
        invitation, raw_token = StaffInvitationService.create(
            organization=self.org_a,
            branch=free_branch,
            email="new.staff@example.com",
            role=Membership.Role.BRANCH_ADMIN,
            invited_by=self.org_admin,
        )
        self.client.force_authenticate(user=None)

        preview = self.client.get(
            reverse("management:invitation-preview"),
            {"token": raw_token},
        )
        accepted = self.client.post(
            reverse("management:invitation-accept-new"),
            {
                "token": raw_token,
                "full_name": "Nguyễn Quản Lý",
                "phone": "0901234567",
                "password": "NewStaff!2026",
            },
            format="json",
        )

        self.assertEqual(preview.status_code, status.HTTP_200_OK)
        self.assertFalse(preview.data["data"]["has_account"])
        self.assertEqual(preview.data["data"]["organization_name"], self.org_a.name)
        self.assertEqual(preview.data["data"]["branch_name"], free_branch.name)
        self.assertEqual(preview.data["data"]["role"], Membership.Role.BRANCH_ADMIN)
        self.assertEqual(preview.data["data"]["invited_by_name"], self.org_admin.full_name)
        self.assertEqual(
            preview.data["data"]["expires_at"],
            invitation.expires_at,
        )
        self.assertEqual(accepted.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", accepted.data["data"]["tokens"])
        user = User.objects.get(email="new.staff@example.com")
        self.assertEqual(user.full_name, "Nguyễn Quản Lý")
        self.assertEqual(user.phone, "0901234567")
        self.assertIsNotNone(user.email_verified_at)
        self.assertTrue(user.check_password("NewStaff!2026"))
        self.assertFalse(PatientProfile.objects.filter(user=user).exists())
        self.assertTrue(
            Membership.objects.filter(
                user=user,
                branch=free_branch,
                role=Membership.Role.BRANCH_ADMIN,
                is_active=True,
            ).exists()
        )
        invitation.refresh_from_db()
        self.assertIsNotNone(invitation.accepted_at)

        reused = self.client.post(
            reverse("management:invitation-accept-new"),
            {
                "token": raw_token,
                "full_name": "Nguyễn Quản Lý",
                "phone": "0901234567",
                "password": "NewStaff!2026",
            },
            format="json",
        )
        self.assertEqual(reused.status_code, status.HTTP_400_BAD_REQUEST)

    def test_existing_account_must_sign_in_instead_of_accepting_as_new(self):
        free_branch = self.make_branch(self.org_a, "FREE-EXISTING")
        existing = self.make_user("existing.invitee@example.com")
        _invitation, raw_token = StaffInvitationService.create(
            organization=self.org_a,
            branch=free_branch,
            email=existing.email,
            role=Membership.Role.BRANCH_ADMIN,
            invited_by=self.org_admin,
        )
        self.client.force_authenticate(user=None)

        preview = self.client.get(
            reverse("management:invitation-preview"),
            {"token": raw_token},
        )
        accepted = self.client.post(
            reverse("management:invitation-accept-new"),
            {
                "token": raw_token,
                "full_name": "Tên khác",
                "phone": "0901234567",
                "password": "NewStaff!2026",
            },
            format="json",
        )

        self.assertTrue(preview.data["data"]["has_account"])
        self.assertEqual(accepted.status_code, status.HTTP_409_CONFLICT)
        existing.refresh_from_db()
        self.assertNotEqual(existing.full_name, "Tên khác")
        self.assertFalse(Membership.objects.filter(user=existing, branch=free_branch).exists())

    def test_last_organization_admin_cannot_be_deactivated(self):
        self.client.force_authenticate(self.org_admin)

        response = self.client.patch(
            reverse("management:membership-detail", kwargs={"membership_id": self.org_admin_membership.pk}),
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.org_admin_membership.refresh_from_db()
        self.assertTrue(self.org_admin_membership.is_active)

    def test_org_admin_creates_dentist_and_assigns_service_and_branch(self):
        service = Service.objects.create(
            organization=self.org_a,
            code="CLEAN",
            name="Cleaning",
            standard_duration_minutes=30,
            standard_price=Decimal("500000"),
        )
        self.client.force_authenticate(self.org_admin)
        create_response = self.client.post(
            reverse("management:organization-dentists", kwargs={"organization_id": self.org_a.pk}),
            {"email": self.dentist_user.email, "license_number": "DDS-001"},
            format="json",
        )
        dentist_id = create_response.data["data"]["id_dentist"]
        service_response = self.client.put(
            reverse("management:dentist-services", kwargs={"dentist_id": dentist_id}),
            {"ids": [service.pk]},
            format="json",
        )
        branch_response = self.client.put(
            reverse("management:dentist-branches", kwargs={"dentist_id": dentist_id}),
            {"ids": [self.branch_a.pk]},
            format="json",
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(service_response.status_code, status.HTTP_200_OK)
        self.assertEqual(branch_response.status_code, status.HTTP_200_OK)
        self.assertTrue(DentistService.objects.filter(dentist_id=dentist_id, service=service).exists())
        self.assertTrue(Membership.objects.filter(user=self.dentist_user, branch=self.branch_a, role=Membership.Role.DENTIST, is_active=True).exists())

    def test_opening_hours_requires_exactly_seven_days(self):
        self.client.force_authenticate(self.org_admin)
        response = self.client.put(
            reverse("management:branch-opening-hours", kwargs={"branch_id": self.branch_a.pk}),
            {"opening_hours": [{"weekday": 1, "is_closed": False, "open_time": "08:00", "close_time": "17:00"}]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_deactivate_chair_with_active_future_appointment(self):
        patient_user = self.make_user("future-patient@example.com")
        patient = PatientProfile.objects.create(user=patient_user)
        Membership.objects.create(
            user=patient_user, organization=self.org_a, role=Membership.Role.PATIENT
        )
        dentist = Dentist.objects.create(
            user=self.dentist_user, organization=self.org_a
        )
        Membership.objects.create(
            user=self.dentist_user, organization=self.org_a, branch=self.branch_a,
            role=Membership.Role.DENTIST,
        )
        service = Service.objects.create(
            organization=self.org_a, code="FUTURE", name="Future service",
            standard_duration_minutes=30, standard_price=100,
        )
        branch_service = BranchService.objects.create(
            branch=self.branch_a, service=service, price=100
        )
        chair = Chair.objects.create(
            branch=self.branch_a, code="FUTURE-C", name="Future chair",
            resource_type=Chair.ResourceType.CHAIR,
        )
        starts_at = timezone.now() + timedelta(days=1)
        Appointment.objects.create(
            public_code="APT-FUTURE-MANAGE",
            patient_profile=patient,
            branch=self.branch_a,
            branch_service=branch_service,
            dentist=dentist,
            chair=chair,
            service_name_snapshot=service.name,
            service_price_snapshot=branch_service.price,
            duration_minutes=30,
            starts_at=starts_at,
            ends_at=starts_at + timedelta(minutes=30),
            occupied_until=starts_at + timedelta(minutes=30),
            status=Appointment.Status.CONFIRMED,
        )
        self.client.force_authenticate(self.branch_admin)

        response = self.client.patch(
            reverse("management:chair-detail", kwargs={"chair_id": chair.pk}),
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        chair.refresh_from_db()
        self.assertTrue(chair.is_active)

    def test_inactive_membership_is_denied(self):
        Membership.objects.filter(user=self.branch_admin).update(is_active=False)
        self.client.force_authenticate(self.branch_admin)

        response = self.client.get(reverse("management:branch-detail", kwargs={"branch_id": self.branch_a.pk}))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
