import uuid
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import Dentist, PatientProfile
from apps.audit.services import AuditService
from apps.locations.models import Chair
from apps.organizations.models import Membership, Organization

from .availability import AvailabilityService
from .exceptions import BookingValidationError, SlotUnavailableError
from .models import ACTIVE_APPOINTMENT_STATUSES, Appointment, AppointmentStatusHistory
from .services import AppointmentService


class BookingService:
    EXCLUSION_CONSTRAINTS = {
        "excl_appointments_dentist_time",
        "excl_appointments_chair_time",
    }

    @staticmethod
    def _constraint_name(error):
        cause = getattr(error, "__cause__", None)
        diagnostic = getattr(cause, "diag", None)
        return getattr(diagnostic, "constraint_name", None)

    @classmethod
    @transaction.atomic
    def create_hold(
        cls,
        *,
        patient_user,
        branch_service,
        starts_at,
        requested_dentist=None,
        contact_name=None,
        contact_phone=None,
        contact_email=None,
        patient_note="",
        request=None,
    ):
        # Availability intentionally stays read-only. Before claiming a slot, clear
        # only this branch's expired holds so stale exclusion constraints cannot
        # reject a slot advertised as available if Celery beat is delayed.
        AppointmentService.expire_due_holds(branch_id=branch_service.branch_id)

        try:
            patient_profile = PatientProfile.objects.select_for_update().get(
                user=patient_user
            )
        except PatientProfile.DoesNotExist as error:
            raise BookingValidationError(
                "Tài khoản chưa có hồ sơ bệnh nhân.",
                code="patient_profile_required",
            ) from error
        now = timezone.now()
        active_hold_count = Appointment.objects.filter(
            patient_profile=patient_profile,
            status=Appointment.Status.HELD,
            expires_at__gt=now,
        ).count()
        if active_hold_count >= settings.MAX_ACTIVE_HOLDS_PER_PATIENT:
            raise BookingValidationError(
                "Đã đạt giới hạn số chỗ đang giữ. Hãy xác nhận hoặc chờ chỗ cũ hết hạn.",
                code="active_hold_limit_reached",
            )

        organization = Organization.objects.select_for_update().get(
            pk=branch_service.branch.organization_id
        )
        if not organization.is_active:
            raise SlotUnavailableError(
                "Chuỗi phòng khám hiện đang tạm ngừng hoạt động.",
                code="organization_inactive",
            )
        membership, _ = Membership.objects.get_or_create(
            user=patient_user,
            organization=organization,
            role=Membership.Role.PATIENT,
            branch=None,
            defaults={"is_active": True},
        )
        if not membership.is_active:
            raise BookingValidationError(
                "Tài khoản chưa có quyền bệnh nhân tại chuỗi phòng khám này.",
                code="patient_membership_required",
            )

        local_timezone = ZoneInfo(organization.timezone)
        target_date = starts_at.astimezone(local_timezone).date()
        if target_date > timezone.now().astimezone(local_timezone).date() + timedelta(
            days=AvailabilityService.MAX_BOOKING_ADVANCE_DAYS
        ):
            raise BookingValidationError(
                "Chỉ được đặt lịch trong 90 ngày tới.",
                code="booking_window_exceeded",
            )
        day_starts_at = datetime.combine(target_date, time.min, tzinfo=local_timezone)
        next_day_starts_at = day_starts_at + timedelta(days=1)
        has_active_appointment_that_day = Appointment.objects.filter(
            patient_profile=patient_profile,
            status__in=ACTIVE_APPOINTMENT_STATUSES,
            starts_at__gte=day_starts_at,
            starts_at__lt=next_day_starts_at,
        ).filter(
            Q(status=Appointment.Status.HELD, expires_at__gt=now)
            | ~Q(status=Appointment.Status.HELD)
        ).exists()
        if has_active_appointment_that_day:
            raise BookingValidationError(
                "Bạn đã có một lịch hẹn còn hiệu lực trong ngày này. "
                "Vui lòng chọn ngày khác hoặc đổi lịch hiện tại.",
                code="daily_active_appointment_limit_reached",
            )
        options = AvailabilityService.list_slots(
            branch_service=branch_service,
            target_date=target_date,
            dentist=requested_dentist,
        )
        selected_option = next(
            (option for option in options if option.starts_at == starts_at),
            None,
        )
        if selected_option is None:
            raise SlotUnavailableError("Khung giờ đã chọn không còn trống.")

        duration_minutes, buffer_minutes = AvailabilityService.effective_duration(
            branch_service
        )
        held_at = now
        expires_at = held_at + timedelta(minutes=organization.slot_hold_minutes)

        for dentist_id in selected_option.dentist_ids:
            for chair_id in selected_option.chair_ids:
                try:
                    with transaction.atomic():
                        dentist = Dentist.objects.select_for_update().get(
                            pk=dentist_id,
                            is_active=True,
                        )
                        # Schedule editors lock the same dentist row. Recheck after
                        # obtaining that lock so a just-saved leave/shift change
                        # cannot be bypassed by slots calculated before the wait.
                        current_options = AvailabilityService.list_slots(
                            branch_service=branch_service,
                            target_date=target_date,
                            dentist=dentist,
                        )
                        current_option = next(
                            (
                                option
                                for option in current_options
                                if option.starts_at == starts_at
                                and dentist.pk in option.dentist_ids
                                and chair_id in option.chair_ids
                            ),
                            None,
                        )
                        if current_option is None:
                            continue
                        chair = Chair.objects.select_for_update().get(
                            pk=chair_id,
                            is_active=True,
                        )
                        appointment = Appointment.objects.create(
                            public_code=f"APT-{uuid.uuid4().hex[:20].upper()}",
                            patient_profile=patient_profile,
                            branch=branch_service.branch,
                            branch_service=branch_service,
                            dentist=dentist,
                            chair=chair,
                            service_name_snapshot=branch_service.service.name,
                            service_price_snapshot=branch_service.price,
                            contact_name_snapshot=(contact_name or patient_user.full_name).strip(),
                            contact_phone_snapshot=(contact_phone or patient_user.phone or "").strip() or None,
                            contact_email_snapshot=(contact_email or patient_user.email).strip().lower(),
                            patient_note=patient_note.strip(),
                            duration_minutes=duration_minutes,
                            buffer_minutes=buffer_minutes,
                            starts_at=current_option.starts_at,
                            ends_at=current_option.ends_at,
                            occupied_until=current_option.occupied_until,
                            status=Appointment.Status.HELD,
                            held_at=held_at,
                            expires_at=expires_at,
                        )
                        AppointmentStatusHistory.objects.create(
                            appointment=appointment,
                            from_status=None,
                            to_status=Appointment.Status.HELD,
                            actor_user=patient_user,
                            actor_type=AppointmentStatusHistory.ActorType.PATIENT,
                            reason="Giữ chỗ khi đặt lịch.",
                        )
                        AuditService.record_write(
                            actor_user=patient_user,
                            organization=organization,
                            branch=branch_service.branch,
                            action="APPOINTMENT_HELD",
                            resource_type="Appointment",
                            resource_id=appointment.pk,
                            after_data={"status": Appointment.Status.HELD},
                            request=request,
                        )
                        return appointment
                except IntegrityError as error:
                    if cls._constraint_name(error) not in cls.EXCLUSION_CONSTRAINTS:
                        raise

        raise SlotUnavailableError("Khung giờ vừa được người khác giữ chỗ.")
