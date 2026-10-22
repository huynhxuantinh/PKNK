from datetime import datetime, time, timedelta
from decimal import Decimal
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Dentist, PatientProfile, User
from apps.billing.services import BillingService
from apps.catalog.models import BranchService, Service
from apps.locations.models import (
    Branch,
    BranchOpeningHour,
    Chair,
    Holiday,
    Province,
    Ward,
)
from apps.organizations.models import Membership, Organization
from apps.scheduling.models import Appointment


class RevenueReportingTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        province = Province.objects.create(code="79", name="HCM", full_name="Ho Chi Minh")
        ward = Ward.objects.create(code="00001", province=province, name="Ward", full_name="Ward")
        cls.organization = Organization.objects.create(name="Report Org", slug="report-org")
        cls.foreign_org = Organization.objects.create(name="Foreign Report Org", slug="foreign-report-org")
        cls.branch_a = cls.make_branch(cls.organization, province, ward, "A")
        cls.branch_b = cls.make_branch(cls.organization, province, ward, "B")
        cls.foreign_branch = cls.make_branch(cls.foreign_org, province, ward, "F")

        cls.org_admin = cls.user("report-org-admin@example.com", "Org Admin")
        cls.branch_admin = cls.user("report-branch-admin@example.com", "Branch Admin")
        cls.foreign_admin = cls.user("report-foreign-admin@example.com", "Foreign Admin")
        Membership.objects.create(user=cls.org_admin, organization=cls.organization, role=Membership.Role.ORGANIZATION_ADMIN)
        Membership.objects.create(user=cls.branch_admin, organization=cls.organization, branch=cls.branch_a, role=Membership.Role.BRANCH_ADMIN)
        Membership.objects.create(user=cls.foreign_admin, organization=cls.foreign_org, role=Membership.Role.ORGANIZATION_ADMIN)

        patient_user = cls.user("report-patient@example.com", "Patient")
        cls.patient = PatientProfile.objects.create(user=patient_user)
        cls.dentist, cls.service = cls.make_clinical_resources(cls.organization, "MAIN")
        cls.foreign_dentist, cls.foreign_service = cls.make_clinical_resources(cls.foreign_org, "FOREIGN")
        cls.branch_service_a, cls.chair_a = cls.make_branch_resources(cls.branch_a, cls.service, "500000")
        cls.branch_service_b, cls.chair_b = cls.make_branch_resources(cls.branch_b, cls.service, "700000")
        cls.foreign_branch_service, cls.foreign_chair = cls.make_branch_resources(cls.foreign_branch, cls.foreign_service, "900000")

    @classmethod
    def user(cls, email, name):
        return User.objects.create_user(
            email=email, password="StrongPassword!2026", full_name=name,
            email_verified_at=timezone.now(),
        )

    @classmethod
    def make_branch(cls, organization, province, ward, code):
        return Branch.objects.create(
            organization=organization, code=code, name=f"Branch {code}",
            province=province, ward=ward, address_line=code,
            location=f"POINT({106.7 + len(code) / 100} 10.7)",
        )

    @classmethod
    def make_clinical_resources(cls, organization, code):
        dentist_user = cls.user(f"dentist-{code.lower()}@example.com", f"Dentist {code}")
        dentist = Dentist.objects.create(user=dentist_user, organization=organization)
        service = Service.objects.create(
            organization=organization, code=code, name=f"Service {code}",
            standard_duration_minutes=30, standard_price=Decimal("500000"),
        )
        return dentist, service

    @classmethod
    def make_branch_resources(cls, branch, service, price):
        branch_service = BranchService.objects.create(branch=branch, service=service, price=Decimal(price))
        chair = Chair.objects.create(branch=branch, code="C1", name="Chair", resource_type=Chair.ResourceType.CHAIR)
        return branch_service, chair

    def paid_invoice(self, *, branch, branch_service, dentist, chair, code, actor, paid_at=None):
        starts = timezone.now() - timedelta(hours=2)
        appointment = Appointment.objects.create(
            public_code=code, patient_profile=self.patient, branch=branch,
            branch_service=branch_service, dentist=dentist, chair=chair,
            service_name_snapshot=branch_service.service.name,
            service_price_snapshot=branch_service.price,
            duration_minutes=30, buffer_minutes=0, starts_at=starts,
            ends_at=starts + timedelta(minutes=30), occupied_until=starts + timedelta(minutes=30),
            status=Appointment.Status.COMPLETED, completed_at=timezone.now(),
        )
        invoice = BillingService.create_invoice(appointment_id=appointment.pk, actor_user=actor)
        invoice = BillingService.issue_invoice(invoice_id=invoice.pk, actor_user=actor)
        payment_kwargs = {
            "invoice_id": invoice.pk,
            "method": "CASH",
            "amount": invoice.total,
            "idempotency_key": f"report-payment-{code}",
            "actor_user": actor,
        }
        if paid_at is None:
            payment, _ = BillingService.post_payment(**payment_kwargs)
        else:
            with patch("apps.billing.services.timezone.now", return_value=paid_at):
                payment, _ = BillingService.post_payment(**payment_kwargs)
        invoice.refresh_from_db()
        return invoice, payment

    def period(self):
        today = timezone.localdate()
        return {"date_from": today.isoformat(), "date_to": today.isoformat()}

    def report_appointment(self, *, branch, branch_service, chair, code, status_value, hour):
        starts = datetime.combine(
            timezone.localdate(), time(hour=hour), tzinfo=ZoneInfo(self.organization.timezone)
        )
        extra = {}
        if status_value == Appointment.Status.COMPLETED:
            extra["completed_at"] = starts + timedelta(minutes=30)
        elif status_value == Appointment.Status.CANCELLED:
            extra.update({
                "cancelled_at": starts - timedelta(hours=1),
                "cancelled_by": self.org_admin,
                "cancel_reason": "Bá»‡nh nhĂ¢n báº­n",
            })
        elif status_value == Appointment.Status.NO_SHOW:
            extra["no_show_at"] = starts + timedelta(minutes=15)
        elif status_value == Appointment.Status.HELD:
            extra.update({
                "held_at": starts - timedelta(minutes=10),
                "expires_at": starts,
            })
        return Appointment.objects.create(
            public_code=code, patient_profile=self.patient, branch=branch,
            branch_service=branch_service, dentist=self.dentist, chair=chair,
            service_name_snapshot=branch_service.service.name,
            service_price_snapshot=branch_service.price,
            duration_minutes=30, buffer_minutes=0, starts_at=starts,
            ends_at=starts + timedelta(minutes=30),
            occupied_until=starts + timedelta(minutes=30),
            status=status_value, **extra,
        )

    def capacity_appointment(
        self, *, chair, code, status_value, report_date, hour,
        duration_minutes, buffer_minutes=0,
    ):
        starts = datetime.combine(
            report_date, time(hour=hour), tzinfo=ZoneInfo(self.organization.timezone)
        )
        ends = starts + timedelta(minutes=duration_minutes)
        occupied_until = ends + timedelta(minutes=buffer_minutes)
        extra = {}
        if status_value == Appointment.Status.COMPLETED:
            extra["completed_at"] = ends
        elif status_value == Appointment.Status.CANCELLED:
            extra.update({
                "cancelled_at": starts - timedelta(hours=1),
                "cancelled_by": self.org_admin,
                "cancel_reason": "Cancelled for report test",
            })
        elif status_value == Appointment.Status.HELD:
            extra.update({
                "held_at": starts - timedelta(minutes=10),
                "expires_at": starts,
            })
        return Appointment.objects.create(
            public_code=code, patient_profile=self.patient, branch=self.branch_a,
            branch_service=self.branch_service_a, dentist=self.dentist, chair=chair,
            service_name_snapshot=self.service.name,
            service_price_snapshot=self.branch_service_a.price,
            duration_minutes=duration_minutes, buffer_minutes=buffer_minutes,
            starts_at=starts, ends_at=ends, occupied_until=occupied_until,
            status=status_value, **extra,
        )

    def test_organization_revenue_groups_branches_and_excludes_other_org(self):
        self.paid_invoice(branch=self.branch_a, branch_service=self.branch_service_a, dentist=self.dentist, chair=self.chair_a, code="APT-REPORT-A", actor=self.org_admin)
        self.paid_invoice(branch=self.branch_b, branch_service=self.branch_service_b, dentist=self.dentist, chair=self.chair_b, code="APT-REPORT-B", actor=self.org_admin)
        self.paid_invoice(branch=self.foreign_branch, branch_service=self.foreign_branch_service, dentist=self.foreign_dentist, chair=self.foreign_chair, code="APT-REPORT-F", actor=self.foreign_admin)
        self.client.force_authenticate(self.org_admin)

        response = self.client.get(
            reverse("management:organization-revenue-report", kwargs={"organization_id": self.organization.pk}),
            self.period(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["total_revenue"], "1200000.00")
        self.assertEqual(response.data["data"]["paid_invoice_count"], 2)
        self.assertEqual(
            {row["branch_id"]: row["revenue"] for row in response.data["data"]["by_branch"]},
            {self.branch_a.pk: "500000.00", self.branch_b.pk: "700000.00"},
        )

    def test_void_payment_is_not_revenue(self):
        invoice, payment = self.paid_invoice(
            branch=self.branch_a, branch_service=self.branch_service_a,
            dentist=self.dentist, chair=self.chair_a, code="APT-REPORT-VOID", actor=self.org_admin,
        )
        BillingService.void_payment(
            payment_id=payment.pk, reason="Ghi nhận sai", actor_user=self.org_admin
        )
        self.client.force_authenticate(self.org_admin)
        response = self.client.get(
            reverse("management:organization-revenue-report", kwargs={"organization_id": self.organization.pk}),
            self.period(),
        )

        self.assertEqual(response.data["data"]["total_revenue"], "0.00")
        self.assertEqual(response.data["data"]["paid_invoice_count"], 0)

    def test_revenue_groups_by_service_and_allocates_discount(self):
        secondary_service = Service.objects.create(
            organization=self.organization, code="SECONDARY", name="Secondary service",
            standard_duration_minutes=30, standard_price=Decimal("400000"),
        )
        appointment = self.report_appointment(
            branch=self.branch_a, branch_service=self.branch_service_a,
            chair=self.chair_a, code="REVENUE-SERVICE",
            status_value=Appointment.Status.COMPLETED, hour=8,
        )
        invoice = BillingService.create_invoice(
            appointment_id=appointment.pk, actor_user=self.org_admin
        )
        invoice = BillingService.update_draft(
            invoice_id=invoice.pk, actor_user=self.org_admin,
            discount=Decimal("100000"),
            lines=[
                {
                    "service": self.service, "description": "Main service",
                    "quantity": 1, "unit_price": Decimal("600000"),
                },
                {
                    "service": secondary_service, "description": "Secondary service",
                    "quantity": 1, "unit_price": Decimal("400000"),
                },
            ],
        )
        invoice = BillingService.issue_invoice(
            invoice_id=invoice.pk, actor_user=self.org_admin
        )
        BillingService.post_payment(
            invoice_id=invoice.pk, method="CASH", amount=invoice.total,
            idempotency_key="report-service-allocation", actor_user=self.org_admin,
        )
        self.client.force_authenticate(self.org_admin)

        response = self.client.get(
            reverse(
                "management:organization-revenue-report",
                kwargs={"organization_id": self.organization.pk},
            ),
            {**self.period(), "interval": "DAY"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertEqual(data["total_revenue"], "900000.00")
        by_service = {row["service_id"]: row for row in data["by_service"]}
        self.assertEqual(by_service[self.service.pk]["revenue"], "540000.00")
        self.assertEqual(by_service[secondary_service.pk]["revenue"], "360000.00")
        self.assertEqual(len(data["by_period"]), 1)
        self.assertEqual(data["by_period"][0]["revenue"], "900000.00")

    def test_revenue_can_group_paid_time_by_local_month(self):
        local_tz = ZoneInfo(self.organization.timezone)
        self.paid_invoice(
            branch=self.branch_a, branch_service=self.branch_service_a,
            dentist=self.dentist, chair=self.chair_a, code="MONTH-JAN",
            actor=self.org_admin, paid_at=datetime(2026, 1, 31, 23, 30, tzinfo=local_tz),
        )
        self.paid_invoice(
            branch=self.branch_b, branch_service=self.branch_service_b,
            dentist=self.dentist, chair=self.chair_b, code="MONTH-FEB",
            actor=self.org_admin, paid_at=datetime(2026, 2, 1, 0, 30, tzinfo=local_tz),
        )
        self.client.force_authenticate(self.org_admin)

        response = self.client.get(
            reverse(
                "management:organization-revenue-report",
                kwargs={"organization_id": self.organization.pk},
            ),
            {"date_from": "2026-01-01", "date_to": "2026-02-28", "interval": "MONTH"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["interval"], "MONTH")
        self.assertEqual(
            response.data["data"]["by_period"],
            [
                {"period_start": "2026-01-01", "revenue": "500000.00", "paid_invoice_count": 1},
                {"period_start": "2026-02-01", "revenue": "700000.00", "paid_invoice_count": 1},
            ],
        )

    def test_branch_admin_only_reads_assigned_branch(self):
        self.client.force_authenticate(self.branch_admin)
        own = self.client.get(
            reverse("management:branch-revenue-report", kwargs={"branch_id": self.branch_a.pk}), self.period()
        )
        other = self.client.get(
            reverse("management:branch-revenue-report", kwargs={"branch_id": self.branch_b.pk}), self.period()
        )
        organization = self.client.get(
            reverse("management:organization-revenue-report", kwargs={"organization_id": self.organization.pk}), self.period()
        )

        self.assertEqual(own.status_code, status.HTTP_200_OK)
        self.assertEqual(other.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(organization.status_code, status.HTTP_404_NOT_FOUND)

    def test_report_requires_valid_period_with_maximum_366_days(self):
        self.client.force_authenticate(self.org_admin)
        url = reverse("management:organization-revenue-report", kwargs={"organization_id": self.organization.pk})
        missing = self.client.get(url)
        too_long = self.client.get(url, {"date_from": "2025-01-01", "date_to": "2026-01-02"})
        reversed_period = self.client.get(url, {"date_from": "2026-02-01", "date_to": "2026-01-01"})

        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(too_long.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(reversed_period.status_code, status.HTTP_400_BAD_REQUEST)

    def test_organization_appointment_report_counts_rates_and_excludes_holds(self):
        cases = [
            (self.branch_a, self.branch_service_a, self.chair_a, "COMPLETED-A1", Appointment.Status.COMPLETED, 8),
            (self.branch_a, self.branch_service_a, self.chair_a, "COMPLETED-A2", Appointment.Status.COMPLETED, 9),
            (self.branch_a, self.branch_service_a, self.chair_a, "CANCELLED-A", Appointment.Status.CANCELLED, 10),
            (self.branch_a, self.branch_service_a, self.chair_a, "NO-SHOW-A", Appointment.Status.NO_SHOW, 11),
            (self.branch_a, self.branch_service_a, self.chair_a, "HELD-A", Appointment.Status.HELD, 12),
            (self.branch_a, self.branch_service_a, self.chair_a, "EXPIRED-A", Appointment.Status.EXPIRED, 13),
            (self.branch_b, self.branch_service_b, self.chair_b, "COMPLETED-B", Appointment.Status.COMPLETED, 14),
        ]
        for branch, branch_service, chair, code, status_value, hour in cases:
            self.report_appointment(
                branch=branch, branch_service=branch_service, chair=chair,
                code=code, status_value=status_value, hour=hour,
            )
        self.client.force_authenticate(self.org_admin)

        response = self.client.get(
            reverse(
                "management:organization-appointment-report",
                kwargs={"organization_id": self.organization.pk},
            ),
            self.period(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertEqual(data["total_appointments"], 5)
        self.assertEqual(data["completed_count"], 3)
        self.assertEqual(data["cancelled_count"], 1)
        self.assertEqual(data["no_show_count"], 1)
        self.assertEqual(data["cancellation_rate_percent"], "20.00")
        self.assertEqual(data["no_show_rate_percent"], "20.00")
        by_branch = {row["branch_id"]: row for row in data["by_branch"]}
        self.assertEqual(by_branch[self.branch_a.pk]["total_appointments"], 4)
        self.assertEqual(by_branch[self.branch_a.pk]["cancellation_rate_percent"], "25.00")
        self.assertEqual(by_branch[self.branch_b.pk]["total_appointments"], 1)

    def test_branch_appointment_report_respects_branch_admin_scope(self):
        self.report_appointment(
            branch=self.branch_a, branch_service=self.branch_service_a,
            chair=self.chair_a, code="BRANCH-REPORT-A",
            status_value=Appointment.Status.COMPLETED, hour=8,
        )
        self.client.force_authenticate(self.branch_admin)

        own = self.client.get(
            reverse("management:branch-appointment-report", kwargs={"branch_id": self.branch_a.pk}),
            self.period(),
        )
        other = self.client.get(
            reverse("management:branch-appointment-report", kwargs={"branch_id": self.branch_b.pk}),
            self.period(),
        )
        organization = self.client.get(
            reverse(
                "management:organization-appointment-report",
                kwargs={"organization_id": self.organization.pk},
            ),
            self.period(),
        )

        self.assertEqual(own.status_code, status.HTTP_200_OK)
        self.assertEqual(own.data["data"]["total_appointments"], 1)
        self.assertEqual(other.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(organization.status_code, status.HTTP_404_NOT_FOUND)

    def test_chair_utilization_uses_open_minutes_buffer_and_booking_statuses(self):
        report_date = timezone.localdate() - timedelta(days=2)
        BranchOpeningHour.objects.create(
            branch=self.branch_a, weekday=report_date.isoweekday(),
            open_time=time(8, 0), close_time=time(17, 0),
        )
        chair_a2 = Chair.objects.create(
            branch=self.branch_a, code="C2", name="Chair 2",
            resource_type=Chair.ResourceType.CHAIR,
        )
        self.capacity_appointment(
            chair=self.chair_a, code="CAPACITY-COMPLETED",
            status_value=Appointment.Status.COMPLETED, report_date=report_date,
            hour=8, duration_minutes=60, buffer_minutes=15,
        )
        self.capacity_appointment(
            chair=chair_a2, code="CAPACITY-CONFIRMED",
            status_value=Appointment.Status.CONFIRMED, report_date=report_date,
            hour=10, duration_minutes=90,
        )
        self.capacity_appointment(
            chair=self.chair_a, code="CAPACITY-CANCELLED",
            status_value=Appointment.Status.CANCELLED, report_date=report_date,
            hour=12, duration_minutes=30,
        )
        self.capacity_appointment(
            chair=self.chair_a, code="CAPACITY-HELD",
            status_value=Appointment.Status.HELD, report_date=report_date,
            hour=13, duration_minutes=30,
        )
        self.client.force_authenticate(self.org_admin)

        response = self.client.get(
            reverse(
                "management:organization-chair-utilization-report",
                kwargs={"organization_id": self.organization.pk},
            ),
            {"date_from": report_date.isoformat(), "date_to": report_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertEqual(data["total_chairs"], 3)
        self.assertEqual(data["available_minutes"], 1080)
        self.assertEqual(data["occupied_minutes"], 165)
        self.assertEqual(data["utilization_rate_percent"], "15.28")
        branch_rows = {row["branch_id"]: row for row in data["by_branch"]}
        branch_a = branch_rows[self.branch_a.pk]
        self.assertEqual(branch_a["open_days"], 1)
        self.assertEqual(branch_a["chair_count"], 2)
        chair_rows = {row["chair_id"]: row for row in branch_a["by_chair"]}
        self.assertEqual(chair_rows[self.chair_a.pk]["occupied_minutes"], 75)
        self.assertEqual(chair_rows[chair_a2.pk]["occupied_minutes"], 90)
        self.assertEqual(branch_rows[self.branch_b.pk]["available_minutes"], 0)

    def test_closed_holiday_has_zero_chair_capacity(self):
        report_date = timezone.localdate() - timedelta(days=2)
        BranchOpeningHour.objects.create(
            branch=self.branch_a, weekday=report_date.isoweekday(),
            open_time=time(8, 0), close_time=time(17, 0),
        )
        Holiday.objects.create(
            organization=self.organization, holiday_date=report_date,
            name="Closed", is_closed=True,
        )
        self.capacity_appointment(
            chair=self.chair_a, code="CAPACITY-HOLIDAY",
            status_value=Appointment.Status.COMPLETED, report_date=report_date,
            hour=8, duration_minutes=60,
        )
        self.client.force_authenticate(self.org_admin)

        response = self.client.get(
            reverse(
                "management:branch-chair-utilization-report",
                kwargs={"branch_id": self.branch_a.pk},
            ),
            {"date_from": report_date.isoformat(), "date_to": report_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["available_minutes"], 0)
        self.assertEqual(response.data["data"]["occupied_minutes"], 0)
        self.assertEqual(response.data["data"]["utilization_rate_percent"], "0.00")

    def test_branch_chair_utilization_report_respects_branch_admin_scope(self):
        self.client.force_authenticate(self.branch_admin)
        own = self.client.get(
            reverse(
                "management:branch-chair-utilization-report",
                kwargs={"branch_id": self.branch_a.pk},
            ),
            self.period(),
        )
        other = self.client.get(
            reverse(
                "management:branch-chair-utilization-report",
                kwargs={"branch_id": self.branch_b.pk},
            ),
            self.period(),
        )
        organization = self.client.get(
            reverse(
                "management:organization-chair-utilization-report",
                kwargs={"organization_id": self.organization.pk},
            ),
            self.period(),
        )

        self.assertEqual(own.status_code, status.HTTP_200_OK)
        self.assertEqual(other.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(organization.status_code, status.HTTP_404_NOT_FOUND)
