from django.db import DatabaseError, transaction
from django.test import TransactionTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.locations.models import Branch, Province, Ward
from apps.organizations.models import Membership, Organization

from .models import AuditEvent
from .services import AuditService


class AuditTestDataMixin:
    @classmethod
    def setUpTestData(cls):
        province = Province.objects.create(code="79", name="HCM", full_name="HCM")
        ward = Ward.objects.create(
            code="00001", province=province, name="Ward", full_name="Ward"
        )
        cls.org_a = Organization.objects.create(name="Org A", slug="audit-org-a")
        cls.org_b = Organization.objects.create(name="Org B", slug="audit-org-b")
        cls.branch_a = Branch.objects.create(
            organization=cls.org_a,
            code="A1",
            name="A1",
            province=province,
            ward=ward,
            address_line="A1",
            location="POINT(106.7 10.7)",
        )
        cls.org_admin = User.objects.create_user(
            email="audit-admin@example.com", password="test", full_name="Audit Admin"
        )
        cls.branch_admin = User.objects.create_user(
            email="audit-branch@example.com", password="test", full_name="Branch Admin"
        )
        Membership.objects.create(
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


class AuditEventAPITests(AuditTestDataMixin, APITestCase):
    def setUp(self):
        self.event = AuditService.record_write(
            actor_user=self.org_admin,
            organization=self.org_a,
            branch=self.branch_a,
            action="BRANCH_UPDATED",
            resource_type="Branch",
            resource_id=self.branch_a.pk,
            before_data={"password": "must-not-leak", "name": "Old"},
            after_data={"token": "must-not-leak", "name": "New"},
        )

    def url(self, organization):
        return reverse(
            "audit:organization-events",
            kwargs={"organization_id": organization.pk},
        )

    def test_organization_admin_reads_only_own_organization_audit(self):
        self.client.force_authenticate(self.org_admin)

        own_response = self.client.get(self.url(self.org_a))
        other_response = self.client.get(self.url(self.org_b))

        self.assertEqual(own_response.status_code, status.HTTP_200_OK)
        self.assertEqual(own_response.data["count"], 1)
        self.assertEqual(other_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_branch_admin_cannot_use_organization_audit_endpoint(self):
        self.client.force_authenticate(self.branch_admin)

        response = self.client.get(self.url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_patient_is_rejected_before_audit_scope_lookup(self):
        patient = User.objects.create_user(
            email="audit-patient@example.com",
            password="test",
            full_name="Audit Patient",
        )
        self.client.force_authenticate(patient)

        response = self.client.get(self.url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_sensitive_keys_are_redacted(self):
        self.event.refresh_from_db()

        self.assertEqual(self.event.before_data["password"], "[REDACTED]")
        self.assertEqual(self.event.after_data["token"], "[REDACTED]")
        self.assertEqual(self.event.after_data["name"], "New")


class AuditEventAppendOnlyTests(TransactionTestCase):
    reset_sequences = True

    def test_database_blocks_update_and_delete(self):
        event = AuditService.record_write(
            action="LOGIN_FAILED",
            resource_type="User",
        )

        with self.assertRaises(DatabaseError), transaction.atomic():
            AuditEvent.objects.filter(pk=event.pk).update(action="CHANGED")
        with self.assertRaises(DatabaseError), transaction.atomic():
            AuditEvent.objects.filter(pk=event.pk).delete()
