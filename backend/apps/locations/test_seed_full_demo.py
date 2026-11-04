import io
import tempfile
from datetime import datetime, timezone as datetime_timezone
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from PIL import Image

from apps.accounts.models import PatientProfile, User
from apps.billing.models import Invoice, PayosTransaction, Payment
from apps.catalog.models import BranchService, DentistService
from apps.clinical.models import ClinicalAmendment, ClinicalEncounter, TreatmentPlan, TreatmentPlanItem
from apps.locations.models import Branch, BranchImage
from apps.notifications.models import NotificationDelivery
from apps.organizations.models import Membership, Organization
from apps.scheduling.models import Appointment, AppointmentStatusHistory
from apps.locations.management.commands.seed_full_demo import Command as SeedFullDemoCommand


FIXED_NOW = datetime(2026, 11, 4, 3, 0, tzinfo=datetime_timezone.utc)


class SeedFullDemoCommandTests(TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.media_dir = root / "media"
        self.clinic_dir = self.media_dir / "01_Phong_kham_noi_that"
        self.clinic_dir.mkdir(parents=True)
        for number in range(9):
            image = Image.new("RGB", (320, 240), color=(10 + number, 90, 130))
            image.save(self.clinic_dir / f"clinic-{number + 1}.jpg", format="JPEG")
        self.asset_dir = root / "public" / "images" / "demo" / "branches"

    def tearDown(self):
        self.temp_dir.cleanup()

    def run_seed(self, *, dry_run=False):
        output = io.StringIO()
        args = [
            "--media-dir", str(self.media_dir),
            "--asset-dir", str(self.asset_dir),
            "--patients", "40",
            "--appointments", "80",
            "--seed", "42",
        ]
        if dry_run:
            args.append("--dry-run")
        call_command("seed_full_demo", *args, stdout=output)
        return output.getvalue()

    @patch("django.utils.timezone.now", return_value=FIXED_NOW)
    def test_full_seed_is_linked_idempotent_and_keeps_payment_mock_only(self, _now):
        output = self.run_seed()
        org = Organization.objects.get(slug="pknk-dental-demo")
        demo_appointments = Appointment.objects.filter(public_code__startswith="DV-DEMO-")

        self.assertEqual(Branch.objects.filter(organization=org).count(), 9)
        active_branch_services = BranchService.objects.filter(
            branch__organization=org,
            is_active=True,
            service__is_active=True,
        ).select_related("branch", "service")
        self.assertEqual(active_branch_services.count(), 9 * 11)
        for branch_service in active_branch_services:
            self.assertTrue(
                SeedFullDemoCommand._has_branch_service_staff(
                    branch_service.branch,
                    branch_service.service,
                    org,
                    today=FIXED_NOW.date(),
                ),
                f"{branch_service.branch.code}/{branch_service.service.code} lacks qualified dentist coverage",
            )
        self.assertEqual(org.memberships.filter(role="BRANCH_ADMIN", is_active=True).count(), 9)
        self.assertGreater(org.memberships.filter(role="DENTIST", is_active=True).count(), 10)
        self.assertEqual(PatientProfile.objects.filter(user__email__endswith="@demo.pknk.vn", user__memberships__organization=org).distinct().count(), 40)
        self.assertEqual(demo_appointments.count(), 80)
        self.assertEqual(
            set(demo_appointments.values_list("status", flat=True)),
            set(Appointment.Status.values),
        )
        self.assertTrue(demo_appointments.filter(rescheduled_from__isnull=False).exists())
        self.assertTrue(demo_appointments.filter(status=Appointment.Status.NO_SHOW, no_show_at__isnull=False).exists())
        self.assertTrue(demo_appointments.filter(status=Appointment.Status.CANCELLED, cancel_reason__gt="").exists())

        appointments = list(demo_appointments.select_related(
            "branch", "branch_service__branch", "branch_service__service", "dentist__user", "patient_profile"
        ).order_by("patient_profile_id", "starts_at"))
        previous_by_patient = {}
        for appointment in appointments:
            self.assertEqual(appointment.branch_service.branch_id, appointment.branch_id)
            self.assertEqual(appointment.dentist.organization_id, org.pk)
            self.assertTrue(DentistService.objects.filter(
                dentist=appointment.dentist, service=appointment.branch_service.service
            ).exists())
            self.assertTrue(Membership.objects.filter(
                organization=org, branch=appointment.branch,
                user=appointment.dentist.user, role=Membership.Role.DENTIST, is_active=True,
            ).exists())
            prior = previous_by_patient.get(appointment.patient_profile_id)
            if prior:
                self.assertLessEqual(prior.occupied_until, appointment.starts_at)
            previous_by_patient[appointment.patient_profile_id] = appointment

        completed = demo_appointments.filter(status=Appointment.Status.COMPLETED)
        self.assertGreaterEqual(completed.count(), 40)
        self.assertFalse(completed.exclude(clinical_encounter__status=ClinicalEncounter.Status.FINALIZED).exists())
        self.assertTrue(demo_appointments.filter(status=Appointment.Status.IN_PROGRESS, clinical_encounter__status=ClinicalEncounter.Status.DRAFT).exists())
        self.assertGreater(ClinicalAmendment.objects.filter(encounter__appointment__public_code__startswith="DV-DEMO-").count(), 0)

        self.assertTrue(TreatmentPlan.objects.filter(status=TreatmentPlan.Status.DRAFT).exists())
        self.assertTrue(TreatmentPlan.objects.filter(status=TreatmentPlan.Status.ACTIVE).exists())
        for plan in TreatmentPlan.objects.all():
            expected_total = sum((item.planned_price for item in plan.items.all()), start=0)
            self.assertEqual(plan.total_estimate, expected_total)
        self.assertTrue(TreatmentPlanItem.objects.filter(status=TreatmentPlanItem.Status.PLANNED).exists())

        self.assertTrue(Invoice.objects.filter(status=Invoice.Status.DRAFT, appointment__public_code__startswith="DV-DEMO-").exists())
        self.assertTrue(Invoice.objects.filter(status=Invoice.Status.ISSUED, appointment__public_code__startswith="DV-DEMO-").exists())
        self.assertTrue(Invoice.objects.filter(status=Invoice.Status.PAID, appointment__public_code__startswith="DV-DEMO-").exists())
        self.assertTrue(Invoice.objects.filter(status=Invoice.Status.VOID, appointment__public_code__startswith="DV-DEMO-").exists())
        self.assertTrue(Invoice.objects.filter(replacement_for__isnull=False, appointment__public_code__startswith="DV-DEMO-").exists())
        self.assertTrue(Payment.objects.filter(invoice__appointment__public_code__startswith="DV-DEMO-", method=Payment.Method.CASH).exists())
        for invoice in Invoice.objects.filter(appointment__public_code__startswith="DV-DEMO-").prefetch_related("lines", "payments"):
            self.assertEqual(invoice.total, sum((line.line_total for line in invoice.lines.all()), start=0))
            if invoice.status == Invoice.Status.PAID:
                self.assertEqual(invoice.payments.get(status=Payment.Status.POSTED).amount, invoice.total)
        self.assertFalse(PayosTransaction.objects.filter(invoice__appointment__public_code__startswith="DV-DEMO-").exists())
        self.assertFalse(NotificationDelivery.objects.filter(notification__event_key__startswith="demo:", channel="EMAIL").exists())

        self.assertEqual(BranchImage.objects.filter(branch__organization=org, storage_key__startswith="/images/demo/branches/").count(), 9)
        self.assertEqual(len(list(self.asset_dir.glob("*.jpg"))), 9)
        self.assertTrue((self.asset_dir / "ATTRIBUTION.md").is_file())
        self.assertTrue(AppointmentStatusHistory.objects.filter(appointment__public_code__startswith="DV-DEMO-").exists())
        self.assertIn("Không tạo giao dịch payOS", output)

        self.run_seed()
        self.assertEqual(Appointment.objects.filter(public_code__startswith="DV-DEMO-").count(), 80)
        self.assertEqual(User.objects.filter(email__startswith="demo.patient.").count(), 38)
        self.assertEqual(Invoice.objects.filter(appointment__public_code__startswith="DV-DEMO-").count(), 32)

    @patch("django.utils.timezone.now", return_value=FIXED_NOW)
    def test_dry_run_validates_media_without_writing_records_or_assets(self, _now):
        output = self.run_seed(dry_run=True)
        self.assertIn("Dry-run", output)
        self.assertFalse(Organization.objects.filter(slug="pknk-dental-demo").exists())
        self.assertFalse(self.asset_dir.exists())

    @patch("django.utils.timezone.now", return_value=FIXED_NOW)
    def test_reset_is_refused_without_deleting_demo_records(self, _now):
        before = Appointment.objects.filter(public_code__startswith="DV-DEMO-").count()
        with self.assertRaisesMessage(CommandError, "Reset bị từ chối"):
            call_command(
                "seed_full_demo",
                "--media-dir", str(self.media_dir),
                "--asset-dir", str(self.asset_dir),
                "--patients", "40",
                "--appointments", "80",
                "--reset-demo",
                stdout=io.StringIO(),
            )
        self.assertEqual(Appointment.objects.filter(public_code__startswith="DV-DEMO-").count(), before)
