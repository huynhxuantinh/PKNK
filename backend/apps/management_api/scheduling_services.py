import uuid
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.models import Dentist, PatientProfile
from apps.audit.services import AuditService
from apps.locations.models import Chair
from apps.notifications.services import NotificationService
from apps.organizations.models import Membership
from apps.scheduling.availability import AvailabilityService
from apps.scheduling.models import (
    ACTIVE_APPOINTMENT_STATUSES,
    Appointment,
    AppointmentStatusHistory,
    WorkShift,
)
from apps.scheduling.services import AppointmentService

from .exceptions import ManagementConflict


def ensure_dentist_assigned(*, dentist, branch):
    if (
        not dentist.is_active
        or dentist.organization_id != branch.organization_id
        or not Membership.objects.filter(
            user=dentist.user,
            organization=branch.organization,
            branch=branch,
            role=Membership.Role.DENTIST,
            is_active=True,
        ).exists()
    ):
        raise DjangoValidationError(
            {"dentist_id": "Nha sĩ không hoạt động hoặc chưa được gán vào chi nhánh."}
        )


def lock_schedule_dentists(*dentists):
    """Serialize schedule edits with appointment holds for these dentists."""
    dentist_ids = sorted({dentist.pk for dentist in dentists if dentist is not None})
    locked = Dentist.objects.select_for_update().filter(pk__in=dentist_ids).order_by("pk")
    locked_by_id = {dentist.pk: dentist for dentist in locked}
    if len(locked_by_id) != len(dentist_ids):
        raise DjangoValidationError({"dentist_id": "Nha sĩ không tồn tại."})
    return locked_by_id


def active_appointments():
    return Appointment.objects.filter(status__in=ACTIVE_APPOINTMENT_STATUSES).exclude(
        status=Appointment.Status.HELD,
        expires_at__lte=timezone.now(),
    )


def _shift_covers(shift, appointment, local_timezone):
    local_start = appointment.starts_at.astimezone(local_timezone)
    local_end = appointment.occupied_until.astimezone(local_timezone)
    return (
        local_start.date() == local_end.date()
        and local_start.date() >= shift.valid_from
        and (shift.valid_to is None or local_start.date() <= shift.valid_to)
        and local_start.isoweekday() == shift.weekday
        and shift.start_time <= local_start.time().replace(tzinfo=None)
        and local_end.time().replace(tzinfo=None) <= shift.end_time
    )


def ensure_shift_change_safe(*, shift, proposed):
    if shift.pk is None:
        return
    appointments = active_appointments().filter(
        branch=shift.branch,
        dentist=shift.dentist,
        starts_at__gte=timezone.now(),
    )
    if not appointments.exists():
        return

    other_shifts = list(
        WorkShift.objects.filter(
            branch=shift.branch, dentist=shift.dentist, is_active=True
        ).exclude(pk=shift.pk)
    )
    candidate = WorkShift(
        dentist=proposed.get("dentist", shift.dentist),
        branch=shift.branch,
        weekday=proposed.get("weekday", shift.weekday),
        start_time=proposed.get("start_time", shift.start_time),
        end_time=proposed.get("end_time", shift.end_time),
        valid_from=proposed.get("valid_from", shift.valid_from),
        valid_to=proposed.get("valid_to", shift.valid_to),
        is_active=proposed.get("is_active", shift.is_active),
    )
    if candidate.is_active and candidate.dentist_id == shift.dentist_id:
        other_shifts.append(candidate)
    local_timezone = ZoneInfo(shift.branch.organization.timezone)
    for appointment in appointments:
        if not any(_shift_covers(item, appointment, local_timezone) for item in other_shifts):
            raise ManagementConflict(
                f"Thay đổi ca làm sẽ làm lịch {appointment.public_code} không còn ca phù hợp."
            )


def ensure_time_off_safe(*, dentist, branch, starts_at, ends_at):
    conflicts = active_appointments().filter(
        dentist=dentist,
        starts_at__lt=ends_at,
        occupied_until__gt=starts_at,
    )
    if branch is not None:
        conflicts = conflicts.filter(branch=branch)
    conflict = conflicts.order_by("starts_at").first()
    if conflict:
        raise ManagementConflict(
            f"Khoảng nghỉ trùng lịch đang hoạt động {conflict.public_code}."
        )


class RescheduleService:
    @staticmethod
    def actor_type(user, appointment):
        if user.pk == appointment.patient_profile.user_id:
            return AppointmentStatusHistory.ActorType.PATIENT
        is_org_admin = Membership.objects.filter(
            user=user,
            organization=appointment.branch.organization,
            branch__isnull=True,
            role=Membership.Role.ORGANIZATION_ADMIN,
            is_active=True,
        ).exists()
        return (
            AppointmentStatusHistory.ActorType.ORGANIZATION_ADMIN
            if is_org_admin
            else AppointmentStatusHistory.ActorType.BRANCH_ADMIN
        )

    @classmethod
    @transaction.atomic
    def reschedule(
        cls,
        *,
        appointment,
        starts_at,
        reason,
        idempotency_key,
        actor_user,
        dentist_id=None,
        request=None,
    ):
        AppointmentService.expire_due_holds(branch_id=appointment.branch_id)
        # Match BookingService's first resource lock. This serializes all
        # booking and reschedule attempts for the same patient, including the
        # case where there is no target-day appointment row to lock yet.
        patient_profile = PatientProfile.objects.select_for_update().get(
            pk=appointment.patient_profile_id
        )
        existing = Appointment.objects.filter(
            reschedule_idempotency_key=idempotency_key
        ).first()
        if existing:
            if existing.rescheduled_from_id != appointment.pk:
                raise ManagementConflict("Khóa idempotency đã được dùng cho lịch khác.")
            return existing, False

        original = (
            Appointment.objects.select_for_update(of=("self",))
            .select_related(
                "branch__organization", "branch_service__service",
                "patient_profile", "dentist", "chair",
            )
            .get(pk=appointment.pk)
        )
        if original.status not in {
            Appointment.Status.PENDING,
            Appointment.Status.CONFIRMED,
        }:
            raise ManagementConflict("Chỉ được dời lịch chờ xác nhận hoặc đã xác nhận.")
        if starts_at <= timezone.now():
            raise DjangoValidationError({"starts_at": "Lịch mới phải ở tương lai."})

        actor_type = cls.actor_type(actor_user, original)
        if actor_type == AppointmentStatusHistory.ActorType.PATIENT:
            cutoff = timedelta(
                minutes=original.branch.organization.cancellation_cutoff_minutes
            )
            if timezone.now() > original.starts_at - cutoff:
                raise ManagementConflict(
                    "The patient rescheduling cutoff has passed."
                )

        # A reschedule keeps the originally selected dentist unless the caller
        # explicitly chooses another eligible dentist.
        requested_dentist = original.dentist
        if dentist_id:
            requested_dentist = Dentist.objects.filter(
                pk=dentist_id,
                organization=original.branch.organization,
                is_active=True,
            ).first()
            if requested_dentist is None:
                raise DjangoValidationError({"dentist_id": "Nha sĩ không hợp lệ."})

        target_date = starts_at.astimezone(
            ZoneInfo(original.branch.organization.timezone)
        ).date()
        local_now = timezone.now().astimezone(
            ZoneInfo(original.branch.organization.timezone)
        )
        if target_date > local_now.date() + timedelta(
            days=AvailabilityService.MAX_BOOKING_ADVANCE_DAYS
        ):
            raise DjangoValidationError(
                {"starts_at": "Chỉ được dời lịch trong 90 ngày tới."}
            )
        options = AvailabilityService.list_slots(
            branch_service=original.branch_service,
            target_date=target_date,
            dentist=requested_dentist,
            exclude_appointment_id=original.pk,
        )
        selected = next((item for item in options if item.starts_at == starts_at), None)
        if selected is None:
            raise ManagementConflict("Khung giờ mới không còn trống.")

        selected_dentist_id = requested_dentist.pk
        if selected_dentist_id not in selected.dentist_ids:
            raise ManagementConflict("Nha sĩ không còn trống trong khung giờ mới.")

        local_timezone = ZoneInfo(original.branch.organization.timezone)
        day_starts_at = datetime.combine(
            selected.starts_at.astimezone(local_timezone).date(),
            time.min,
            tzinfo=local_timezone,
        )
        next_day_starts_at = day_starts_at + timedelta(days=1)
        has_active_appointment_that_day = (
            active_appointments()
            .select_for_update()
            .filter(
                patient_profile=patient_profile,
                starts_at__gte=day_starts_at,
                starts_at__lt=next_day_starts_at,
            )
            .exclude(pk=original.pk)
            .exists()
        )
        if has_active_appointment_that_day:
            raise ManagementConflict(
                "Bệnh nhân đã có một lịch hẹn còn hiệu lực trong ngày này. "
                "Vui lòng chọn ngày khác hoặc hủy lịch hiện có."
            )

        selected_chair_id = selected.chair_ids[0]
        dentist = Dentist.objects.select_for_update().get(pk=selected_dentist_id)
        # Work-shift and time-off edits lock the same dentist row. Re-evaluate
        # availability after obtaining it so a schedule update committed while
        # waiting cannot be bypassed by the earlier slot snapshot.
        current_options = AvailabilityService.list_slots(
            branch_service=original.branch_service,
            target_date=target_date,
            dentist=dentist,
            exclude_appointment_id=original.pk,
        )
        current_selected = next(
            (
                option
                for option in current_options
                if option.starts_at == starts_at
                and dentist.pk in option.dentist_ids
                and selected_chair_id in option.chair_ids
            ),
            None,
        )
        if current_selected is None:
            raise ManagementConflict("Khung giờ mới không còn trống.")
        chair = Chair.objects.select_for_update().get(pk=selected_chair_id)
        AppointmentService.transition_status(
            appointment_id=original.pk,
            to_status=Appointment.Status.CANCELLED,
            actor_type=actor_type,
            actor_user=actor_user,
            reason=f"Dời lịch: {reason}",
            request=request,
            notify=False,
        )
        try:
            with transaction.atomic():
                successor = Appointment.objects.create(
                    public_code=f"APT-{uuid.uuid4().hex[:20].upper()}",
                    patient_profile=patient_profile,
                    branch=original.branch,
                    branch_service=original.branch_service,
                    dentist=dentist,
                    chair=chair,
                    service_name_snapshot=original.service_name_snapshot,
                    service_price_snapshot=original.service_price_snapshot,
                    contact_name_snapshot=original.contact_name_snapshot,
                    contact_phone_snapshot=original.contact_phone_snapshot,
                    contact_email_snapshot=original.contact_email_snapshot,
                    patient_note=original.patient_note,
                    duration_minutes=int(
                        (
                            current_selected.ends_at - current_selected.starts_at
                        ).total_seconds()
                        / 60
                    ),
                    buffer_minutes=int(
                        (
                            current_selected.occupied_until - current_selected.ends_at
                        ).total_seconds()
                        / 60
                    ),
                    starts_at=current_selected.starts_at,
                    ends_at=current_selected.ends_at,
                    occupied_until=current_selected.occupied_until,
                    status=original.status,
                    confirmed_at=(
                        timezone.now()
                        if original.status == Appointment.Status.CONFIRMED
                        else None
                    ),
                    rescheduled_from=original,
                    reschedule_idempotency_key=idempotency_key,
                )
        except IntegrityError as error:
            raise ManagementConflict("Khung giờ mới vừa được người khác đặt.") from error

        AppointmentStatusHistory.objects.create(
            appointment=successor,
            from_status=None,
            to_status=successor.status,
            actor_user=actor_user,
            actor_type=actor_type,
            reason=f"Dời từ {original.public_code}: {reason}",
        )
        AuditService.record_write(
            actor_user=actor_user,
            organization=original.branch.organization,
            branch=original.branch,
            action="APPOINTMENT_RESCHEDULED",
            resource_type="Appointment",
            resource_id=successor.pk,
            before_data={"public_code": original.public_code, "starts_at": original.starts_at},
            after_data={"public_code": successor.public_code, "starts_at": successor.starts_at},
            request=request,
        )
        NotificationService.publish_appointment_rescheduled(
            original=original,
            successor=successor,
        )
        return successor, True
