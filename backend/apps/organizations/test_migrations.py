from importlib import import_module

from django.apps import apps
from django.test import TestCase

from apps.accounts.models import User

from .models import Membership, Organization


class DeactivatePatientRoleMigrationTests(TestCase):
    def test_deactivates_patient_role_for_existing_staff_only(self):
        organization = Organization.objects.create(
            name="Migration Test Organization",
            slug="migration-test-organization",
        )
        staff_user = User.objects.create_user(
            email="migration-staff@example.com",
            password="StrongPassword!2026",
        )
        patient_user = User.objects.create_user(
            email="migration-patient@example.com",
            password="StrongPassword!2026",
        )
        staff_patient_membership = Membership.objects.create(
            user=staff_user,
            organization=organization,
            role=Membership.Role.PATIENT,
        )
        Membership.objects.create(
            user=staff_user,
            organization=organization,
            role=Membership.Role.ORGANIZATION_ADMIN,
        )
        patient_membership = Membership.objects.create(
            user=patient_user,
            organization=organization,
            role=Membership.Role.PATIENT,
        )

        migration = import_module(
            "apps.organizations.migrations.0006_deactivate_patient_role_for_staff"
        )
        migration.deactivate_patient_role_for_staff(apps, None)

        staff_patient_membership.refresh_from_db()
        patient_membership.refresh_from_db()
        self.assertFalse(staff_patient_membership.is_active)
        self.assertTrue(patient_membership.is_active)
