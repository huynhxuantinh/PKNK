import hashlib
from datetime import timedelta
from decimal import Decimal
from urllib.parse import parse_qs, urlparse

from django.core import mail
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

    def test_org_admin_assigns_existing_verified_staff(self):
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
                "branch_id": self.branch_a.pk,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Membership.objects.filter(user=self.staff_user, branch=self.branch_a).exists())
        self.assertFalse(
            Membership.objects.filter(
                user=self.staff_user,
                role=Membership.Role.PATIENT,
                is_active=True,
            ).exists()
        )
        audit_event = AuditEvent.objects.get(
            action="PATIENT_MEMBERSHIP_AUTO_DEACTIVATED",
            resource_type="Membership",
            resource_id=str(patient_membership.pk),
        )
        self.assertEqual(audit_event.actor_user, self.org_admin)
        self.assertEqual(audit_event.organization, self.org_a)
        self.assertEqual(audit_event.before_data, {"is_active": True})
        self.assertEqual(
            audit_event.after_data,
            {
                "is_active": False,
                "reason": "STAFF_ROLE_ASSIGNED",
                "source": "ORGANIZATION_MEMBERSHIP_CREATED",
            },
        )

    def test_cannot_assign_staff_role_while_patient_has_active_appointment(self):
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
                "branch_id": self.branch_a.pk,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("lịch hẹn bệnh nhân", response.data["message"])
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
        invite_email = "patient-invited-as-staff@example.com"
        invitation, raw_token = StaffInvitationService.create(
            organization=self.org_a,
            branch=self.branch_a,
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
        self.create_active_patient_appointment(
            self.staff_user,
            "APT-PATIENT-REACTIVATE",
        )
        staff_membership = Membership.objects.create(
            user=self.staff_user,
            organization=self.org_a,
            branch=self.branch_a,
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
        invite_email = "new-branch-admin@example.com"
        self.client.force_authenticate(self.org_admin)
        with self.captureOnCommitCallbacks(execute=True):
            invite_response = self.client.post(
                reverse("management:organization-memberships", kwargs={"organization_id": self.org_a.pk}),
                {
                    "email": invite_email,
                    "role": Membership.Role.BRANCH_ADMIN,
                    "branch_id": self.branch_a.pk,
                },
                format="json",
            )
        invitation = StaffInvitation.objects.get(email=invite_email)
        raw_token = parse_qs(urlparse(mail.outbox[-1].body.splitlines()[-1]).query)["token"][0]
        invited_user = self.make_user(invite_email)
        self.client.force_authenticate(invited_user)
        first = self.client.post(
            reverse("management:invitation-accept"), {"token": raw_token}, format="json"
        )
        second = self.client.post(
            reverse("management:invitation-accept"), {"token": raw_token}, format="json"
        )

        self.assertEqual(invite_response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(invitation.token_digest, hashlib.sha256(raw_token.encode()).hexdigest())
        self.assertNotEqual(invitation.token_digest, raw_token)
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Membership.objects.filter(user=invited_user, branch=self.branch_a, is_active=True).exists())

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
