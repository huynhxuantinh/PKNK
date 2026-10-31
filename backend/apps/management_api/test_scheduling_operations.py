from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Dentist, PatientProfile, User
from apps.audit.models import AuditEvent
from apps.catalog.models import BranchService, DentistService, Service
from apps.locations.models import Branch, BranchOpeningHour, Chair, Province, Ward
from apps.organizations.models import Membership, Organization
from apps.scheduling.availability import AvailabilityService
from apps.scheduling.models import Appointment, TimeOff, WorkShift


class BranchSchedulingManagementTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        province = Province.objects.create(code="79", name="HCM", full_name="HCM")
        ward = Ward.objects.create(code="00001", province=province, name="Ward", full_name="Ward")
        cls.organization = Organization.objects.create(name="Schedule Org", slug="schedule-org")
        cls.branch = cls.make_branch(cls.organization, province, ward, "A")
        cls.other_branch = cls.make_branch(cls.organization, province, ward, "B")
        cls.foreign_org = Organization.objects.create(name="Foreign", slug="schedule-foreign")
        cls.foreign_branch = cls.make_branch(cls.foreign_org, province, ward, "F")

        cls.branch_admin = cls.make_user("branch-schedule@example.com", "Branch Admin")
        cls.org_admin = cls.make_user("org-schedule@example.com", "Org Admin")
        cls.foreign_admin = cls.make_user("foreign-schedule@example.com", "Foreign Admin")
        Membership.objects.create(
            user=cls.branch_admin, organization=cls.organization, branch=cls.branch,
            role=Membership.Role.BRANCH_ADMIN,
        )
        Membership.objects.create(
            user=cls.org_admin, organization=cls.organization,
            role=Membership.Role.ORGANIZATION_ADMIN,
        )
        Membership.objects.create(
            user=cls.foreign_admin, organization=cls.foreign_org, branch=cls.foreign_branch,
            role=Membership.Role.BRANCH_ADMIN,
        )

        dentist_user = cls.make_user("dentist-schedule@example.com", "Dentist")
        cls.dentist = Dentist.objects.create(user=dentist_user, organization=cls.organization)
        for branch in (cls.branch, cls.other_branch):
            Membership.objects.create(
                user=dentist_user, organization=cls.organization, branch=branch,
                role=Membership.Role.DENTIST,
            )
        unassigned_user = cls.make_user("unassigned-schedule@example.com", "Unassigned")
        cls.unassigned_dentist = Dentist.objects.create(
            user=unassigned_user, organization=cls.organization
        )
        foreign_dentist_user = cls.make_user("foreign-dentist@example.com", "Foreign Dentist")
        cls.foreign_dentist = Dentist.objects.create(
            user=foreign_dentist_user, organization=cls.foreign_org
        )
        Membership.objects.create(
            user=foreign_dentist_user, organization=cls.foreign_org,
            branch=cls.foreign_branch, role=Membership.Role.DENTIST,
        )

        patient_user = cls.make_user("patient-schedule-manage@example.com", "Patient")
        patient_user.phone = "0901234567"
        patient_user.save(update_fields=["phone"])
        cls.patient = PatientProfile.objects.create(user=patient_user)
        Membership.objects.create(
            user=patient_user, organization=cls.organization, role=Membership.Role.PATIENT
        )
        cls.service = Service.objects.create(
            organization=cls.organization, code="CLEAN", name="Cleaning",
            standard_duration_minutes=30, buffer_minutes=10,
            standard_price=Decimal("500000"),
        )
        DentistService.objects.create(dentist=cls.dentist, service=cls.service)
        cls.branch_service = BranchService.objects.create(
            branch=cls.branch, service=cls.service, price=Decimal("500000")
        )
        cls.other_branch_service = BranchService.objects.create(
            branch=cls.other_branch, service=cls.service, price=Decimal("500000")
        )
        cls.chair = Chair.objects.create(
            branch=cls.branch, code="C1", name="Chair 1", resource_type=Chair.ResourceType.CHAIR
        )
        cls.other_chair = Chair.objects.create(
            branch=cls.other_branch, code="C2", name="Chair 2", resource_type=Chair.ResourceType.CHAIR
        )
        cls.target_date = timezone.localdate() + timedelta(days=7)
        for branch in (cls.branch, cls.other_branch):
            BranchOpeningHour.objects.create(
                branch=branch, weekday=cls.target_date.isoweekday(),
                open_time=time(8), close_time=time(17),
            )

    @classmethod
    def make_user(cls, email, full_name):
        return User.objects.create_user(
            email=email, password="StrongPassword!2026", full_name=full_name,
            email_verified_at=timezone.now(),
        )

    @classmethod
    def make_branch(cls, organization, province, ward, code):
        return Branch.objects.create(
            organization=organization, code=code, name=f"Branch {code}",
            province=province, ward=ward, address_line=code,
            location="POINT(106.7 10.7)",
        )

    @classmethod
    def at(cls, hour, minute=0):
        return datetime.combine(
            cls.target_date, time(hour, minute), tzinfo=ZoneInfo("Asia/Ho_Chi_Minh")
        )

    def create_appointment(self, code, *, branch=None, status=Appointment.Status.CONFIRMED, starts_at=None):
        branch = branch or self.branch
        starts_at = starts_at or self.at(9)
        branch_service = self.branch_service if branch == self.branch else self.other_branch_service
        chair = self.chair if branch == self.branch else self.other_chair
        return Appointment.objects.create(
            public_code=code,
            patient_profile=self.patient,
            branch=branch,
            branch_service=branch_service,
            dentist=self.dentist,
            chair=chair,
            service_name_snapshot=self.service.name,
            service_price_snapshot=branch_service.price,
            duration_minutes=30,
            buffer_minutes=10,
            starts_at=starts_at,
            ends_at=starts_at + timedelta(minutes=30),
            occupied_until=starts_at + timedelta(minutes=40),
            status=status,
            confirmed_at=timezone.now() if status == Appointment.Status.CONFIRMED else None,
        )

    def create_shift(self, branch=None):
        return WorkShift.objects.create(
            dentist=self.dentist,
            branch=branch or self.branch,
            weekday=self.target_date.isoweekday(),
            start_time=time(8), end_time=time(17), valid_from=self.target_date,
        )

    def test_branch_admin_creates_shift_only_for_assigned_dentist_and_branch(self):
        self.client.force_authenticate(self.branch_admin)
        url = reverse("management:branch-work-shifts", kwargs={"branch_id": self.branch.pk})
        valid = self.client.post(url, {
            "dentist_id": self.dentist.pk, "weekday": self.target_date.isoweekday(),
            "start_time": "08:00", "end_time": "17:00",
            "valid_from": self.target_date.isoformat(),
        }, format="json")
        invalid = self.client.post(url, {
            "dentist_id": self.unassigned_dentist.pk, "weekday": self.target_date.isoweekday(),
            "start_time": "08:00", "end_time": "17:00",
            "valid_from": self.target_date.isoformat(),
        }, format="json")

        self.assertEqual(valid.status_code, status.HTTP_201_CREATED)
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)

    def test_branch_dentist_list_only_returns_active_assignments(self):
        inactive_user = self.make_user("inactive-dentist@example.com", "Inactive Dentist")
        inactive_dentist = Dentist.objects.create(
            user=inactive_user,
            organization=self.organization,
            is_active=False,
        )
        Membership.objects.create(
            user=inactive_user,
            organization=self.organization,
            branch=self.branch,
            role=Membership.Role.DENTIST,
        )
        disabled_assignment_user = self.make_user(
            "disabled-assignment@example.com",
            "Disabled Assignment",
        )
        Dentist.objects.create(
            user=disabled_assignment_user,
            organization=self.organization,
        )
        Membership.objects.create(
            user=disabled_assignment_user,
            organization=self.organization,
            branch=self.branch,
            role=Membership.Role.DENTIST,
            is_active=False,
        )

        self.client.force_authenticate(self.branch_admin)
        response = self.client.get(
            reverse("management:branch-dentists", kwargs={"branch_id": self.branch.pk})
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item["id_dentist"] for item in response.data["data"]],
            [self.dentist.pk],
        )
        self.assertNotContains(response, inactive_dentist.user.full_name)

    def test_time_off_overlapping_active_appointment_is_rejected(self):
        self.create_appointment("APT-TIME-OFF")
        self.client.force_authenticate(self.branch_admin)

        response = self.client.post(
            reverse("management:branch-time-offs", kwargs={"branch_id": self.branch.pk}),
            {
                "dentist_id": self.dentist.pk,
                "starts_at": self.at(8, 30).isoformat(),
                "ends_at": self.at(10).isoformat(),
                "reason": "Leave",
            }, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertFalse(TimeOff.objects.exists())

    def test_org_wide_time_off_cannot_move_to_dentist_in_another_organization(self):
        time_off = TimeOff.objects.create(
            dentist=self.dentist,
            branch=None,
            starts_at=self.at(12),
            ends_at=self.at(13),
            reason="Organization leave",
        )
        self.client.force_authenticate(self.org_admin)

        response = self.client.patch(
            reverse("management:time-off-detail", kwargs={"time_off_id": time_off.pk}),
            {"dentist_id": self.foreign_dentist.pk},
            format="json",
        )

        time_off.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(time_off.dentist_id, self.dentist.pk)

    def test_calendar_is_scoped_to_assigned_branch(self):
        appointment = self.create_appointment("APT-CALENDAR")
        appointment.contact_name_snapshot = "Người liên hệ đặt lịch"
        appointment.contact_phone_snapshot = "0909988776"
        appointment.contact_email_snapshot = "contact@example.com"
        appointment.patient_note = "Đau răng số 7"
        appointment.save(update_fields=[
            "contact_name_snapshot",
            "contact_phone_snapshot",
            "contact_email_snapshot",
            "patient_note",
        ])
        self.client.force_authenticate(self.branch_admin)
        response = self.client.get(
            reverse("management:branch-appointments", kwargs={"branch_id": self.branch.pk}),
            {"date_from": self.at(0).isoformat(), "date_to": self.at(23, 59).isoformat()},
        )
        cross = self.client.get(
            reverse("management:branch-appointments", kwargs={"branch_id": self.other_branch.pk}),
            {"date_from": self.at(0).isoformat(), "date_to": self.at(23, 59).isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"][0]["public_code"], appointment.public_code)
        self.assertEqual(response.data["data"][0]["patient_name"], self.patient.user.full_name)
        self.assertEqual(response.data["data"][0]["contact_name_snapshot"], appointment.contact_name_snapshot)
        self.assertEqual(response.data["data"][0]["contact_phone_snapshot"], appointment.contact_phone_snapshot)
        self.assertEqual(response.data["data"][0]["contact_email_snapshot"], appointment.contact_email_snapshot)
        self.assertEqual(response.data["data"][0]["patient_note"], appointment.patient_note)
        self.assertEqual(cross.status_code, status.HTTP_404_NOT_FOUND)

    def test_confirm_then_check_in_writes_history_and_audit(self):
        appointment = self.create_appointment(
            "APT-FLOW",
            status=Appointment.Status.PENDING,
            starts_at=timezone.now() + timedelta(minutes=10),
        )
        self.client.force_authenticate(self.branch_admin)
        confirm = self.client.post(reverse("management:appointment-confirm", kwargs={"public_code": appointment.public_code}))
        check_in = self.client.post(reverse("management:appointment-check-in", kwargs={"public_code": appointment.public_code}))

        appointment.refresh_from_db()
        self.assertEqual(confirm.status_code, status.HTTP_200_OK)
        self.assertEqual(check_in.status_code, status.HTTP_200_OK)
        self.assertEqual(appointment.status, Appointment.Status.CHECKED_IN)
        self.assertEqual(appointment.status_histories.count(), 2)
        self.assertEqual(AuditEvent.objects.filter(resource_id=str(appointment.pk), action="APPOINTMENT_STATUS_CHANGED").count(), 2)

    def test_check_in_is_rejected_before_check_in_window(self):
        appointment = self.create_appointment(
            "APT-CHECK-IN-TOO-EARLY",
            starts_at=timezone.now() + timedelta(hours=2),
        )
        self.client.force_authenticate(self.branch_admin)

        response = self.client.post(
            reverse(
                "management:appointment-check-in",
                kwargs={"public_code": appointment.public_code},
            )
        )

        appointment.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(appointment.status, Appointment.Status.CONFIRMED)

    def test_cancel_requires_reason_and_allows_checked_in(self):
        appointment = self.create_appointment("APT-CANCEL-CHECKED", status=Appointment.Status.CHECKED_IN)
        self.client.force_authenticate(self.branch_admin)
        missing = self.client.post(reverse("management:appointment-cancel", kwargs={"public_code": appointment.public_code}), {}, format="json")
        cancelled = self.client.post(
            reverse("management:appointment-cancel", kwargs={"public_code": appointment.public_code}),
            {"reason": "Patient left before treatment"}, format="json",
        )

        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(cancelled.status_code, status.HTTP_200_OK)
        appointment.refresh_from_db()
        self.assertEqual(appointment.status, Appointment.Status.CANCELLED)

    def test_no_show_requires_grace_period(self):
        appointment = self.create_appointment("APT-NO-SHOW", starts_at=timezone.now() + timedelta(hours=1))
        self.client.force_authenticate(self.branch_admin)

        response = self.client.post(reverse("management:appointment-no-show", kwargs={"public_code": appointment.public_code}))

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_reschedule_creates_successor_and_is_idempotent(self):
        self.create_shift()
        original = self.create_appointment("APT-RESCHEDULE", starts_at=self.at(9))
        original.contact_name_snapshot = "Người liên hệ riêng"
        original.contact_phone_snapshot = "0909123456"
        original.contact_email_snapshot = "contact@example.com"
        original.patient_note = "Đau răng số 7, cần được tư vấn sớm."
        original.save(update_fields=[
            "contact_name_snapshot", "contact_phone_snapshot",
            "contact_email_snapshot", "patient_note",
        ])
        self.branch_service.duration_minutes = 45
        self.branch_service.buffer_minutes = 5
        self.branch_service.save(update_fields=["duration_minutes", "buffer_minutes"])
        self.client.force_authenticate(self.branch_admin)
        url = reverse("management:appointment-reschedule", kwargs={"public_code": original.public_code})
        payload = {
            "starts_at": self.at(10).isoformat(),
            "reason": "Patient requested another time",
            "idempotency_key": "reschedule-key-001",
        }
        first = self.client.post(url, payload, format="json")
        second = self.client.post(url, payload, format="json")

        original.refresh_from_db()
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["data"]["public_code"], second.data["data"]["public_code"])
        self.assertEqual(original.status, Appointment.Status.CANCELLED)
        self.assertEqual(Appointment.objects.filter(rescheduled_from=original).count(), 1)
        successor = Appointment.objects.get(rescheduled_from=original)
        self.assertEqual(successor.contact_name_snapshot, original.contact_name_snapshot)
        self.assertEqual(successor.contact_phone_snapshot, original.contact_phone_snapshot)
        self.assertEqual(successor.contact_email_snapshot, original.contact_email_snapshot)
        self.assertEqual(successor.patient_note, original.patient_note)
        self.assertEqual(successor.duration_minutes, 45)
        self.assertEqual(successor.buffer_minutes, 5)
        self.assertEqual(successor.ends_at, self.at(10, 45))
        self.assertEqual(successor.occupied_until, self.at(10, 50))

    def test_reschedule_keeps_original_dentist_when_no_replacement_is_requested(self):
        alternate_user = self.make_user("alternate-dentist@example.com", "Alternate Dentist")
        alternate_dentist = Dentist.objects.create(
            user=alternate_user,
            organization=self.organization,
        )
        Membership.objects.create(
            user=alternate_user,
            organization=self.organization,
            branch=self.branch,
            role=Membership.Role.DENTIST,
        )
        DentistService.objects.create(dentist=alternate_dentist, service=self.service)
        WorkShift.objects.create(
            dentist=alternate_dentist,
            branch=self.branch,
            weekday=self.target_date.isoweekday(),
            start_time=time(8),
            end_time=time(17),
            valid_from=self.target_date,
        )
        original = self.create_appointment("APT-KEEP-DENTIST", starts_at=self.at(9))
        original.dentist = alternate_dentist
        original.save(update_fields=["dentist"])
        self.client.force_authenticate(self.branch_admin)

        response = self.client.post(
            reverse(
                "management:appointment-reschedule",
                kwargs={"public_code": original.public_code},
            ),
            {
                "starts_at": self.at(10).isoformat(),
                "reason": "Patient requested another time",
                "idempotency_key": "reschedule-keep-dentist-001",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        successor = Appointment.objects.get(rescheduled_from=original)
        self.assertEqual(successor.dentist_id, alternate_dentist.pk)

    def test_reschedule_slots_default_to_the_original_dentist(self):
        self.create_shift()
        alternate_user = self.make_user("slots-dentist@example.com", "Slots Dentist")
        alternate_dentist = Dentist.objects.create(
            user=alternate_user,
            organization=self.organization,
        )
        Membership.objects.create(
            user=alternate_user,
            organization=self.organization,
            branch=self.branch,
            role=Membership.Role.DENTIST,
        )
        DentistService.objects.create(dentist=alternate_dentist, service=self.service)
        WorkShift.objects.create(
            dentist=alternate_dentist,
            branch=self.branch,
            weekday=self.target_date.isoweekday(),
            start_time=time(8),
            end_time=time(17),
            valid_from=self.target_date,
        )
        original = self.create_appointment("APT-RESCHEDULE-SLOTS", starts_at=self.at(9))
        original.dentist = alternate_dentist
        original.save(update_fields=["dentist"])
        self.client.force_authenticate(self.branch_admin)

        response = self.client.get(
            reverse(
                "management:appointment-reschedule-slots",
                kwargs={"public_code": original.public_code},
            ),
            {"date": self.target_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["data"])
        self.assertEqual(
            {tuple(item["available_dentist_ids"]) for item in response.data["data"]},
            {(alternate_dentist.pk,)},
        )

    def test_reschedule_rejects_second_active_appointment_on_target_day(self):
        self.create_shift()
        original_starts_at = datetime.combine(
            self.target_date - timedelta(days=1),
            time(9),
            tzinfo=ZoneInfo("Asia/Ho_Chi_Minh"),
        )
        original = self.create_appointment(
            "APT-RESCHEDULE-DAILY-LIMIT",
            starts_at=original_starts_at,
        )
        existing = self.create_appointment(
            "APT-EXISTING-ON-TARGET-DAY",
            starts_at=self.at(14),
        )
        self.client.force_authenticate(self.branch_admin)

        response = self.client.post(
            reverse(
                "management:appointment-reschedule",
                kwargs={"public_code": original.public_code},
            ),
            {
                "starts_at": self.at(10).isoformat(),
                "reason": "Patient requested another day",
                "idempotency_key": "reschedule-daily-limit-001",
            },
            format="json",
        )

        original.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(original.status, Appointment.Status.CONFIRMED)
        self.assertFalse(Appointment.objects.filter(rescheduled_from=original).exists())
        self.assertEqual(existing.status, Appointment.Status.CONFIRMED)

    def test_reschedule_rejects_dates_beyond_booking_window(self):
        original = self.create_appointment("APT-RESCHEDULE-TOO-FAR", starts_at=self.at(9))
        too_far = datetime.combine(
            timezone.localdate() + timedelta(days=91),
            time(10),
            tzinfo=ZoneInfo("Asia/Ho_Chi_Minh"),
        )
        self.client.force_authenticate(self.branch_admin)

        response = self.client.post(
            reverse(
                "management:appointment-reschedule",
                kwargs={"public_code": original.public_code},
            ),
            {
                "starts_at": too_far.isoformat(),
                "reason": "Patient requested another date",
                "idempotency_key": "reschedule-booking-window-001",
            },
            format="json",
        )

        original.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(original.status, Appointment.Status.CONFIRMED)
        self.assertFalse(Appointment.objects.filter(rescheduled_from=original).exists())

    def test_slot_engine_blocks_dentist_busy_at_other_branch(self):
        self.create_shift()
        self.create_shift(self.other_branch)
        self.create_appointment("APT-OTHER-BRANCH", branch=self.other_branch, starts_at=self.at(9))

        options = AvailabilityService.list_slots(
            branch_service=self.branch_service,
            target_date=self.target_date,
            dentist=self.dentist,
            now=self.at(7),
        )

        returned = {option.starts_at for option in options}
        self.assertNotIn(self.at(9), returned)
