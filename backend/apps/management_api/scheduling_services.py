import uuid
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.models import Dentist
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
        existing = Appointment.objects.filter(
            reschedule_idempotency_key=idempotency_key
        ).first()
        if existing:
            if existing.rescheduled_from_id != appointment.pk:
                raise ManagementConflict("Khóa idempotency đã được dùng cho lịch khác.")
            return existing, False

        original = (
            Appointment.objects.select_for_update()
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

        requested_dentist = None
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
        options = AvailabilityService.list_slots(
            branch_service=original.branch_service,
            target_date=target_date,
            dentist=requested_dentist,
            exclude_appointment_id=original.pk,
        )
        selected = next((item for item in options if item.starts_at == starts_at), None)
        if selected is None:
            raise ManagementConflict("Khung giờ mới không còn trống.")

        selected_dentist_id = dentist_id or selected.dentist_ids[0]
        if selected_dentist_id not in selected.dentist_ids:
            raise ManagementConflict("Nha sĩ không còn trống trong khung giờ mới.")
        selected_chair_id = selected.chair_ids[0]
        dentist = Dentist.objects.select_for_update().get(pk=selected_dentist_id)
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
                    patient_profile=original.patient_profile,
                    branch=original.branch,
                    branch_service=original.branch_service,
                    dentist=dentist,
                    chair=chair,
                    service_name_snapshot=original.service_name_snapshot,
                    service_price_snapshot=original.service_price_snapshot,
                    duration_minutes=original.duration_minutes,
                    buffer_minutes=original.buffer_minutes,
                    starts_at=selected.starts_at,
                    ends_at=selected.ends_at,
                    occupied_until=selected.occupied_until,
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
