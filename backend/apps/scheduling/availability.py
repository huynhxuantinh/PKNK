from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import Dentist
from apps.locations.models import BranchOpeningHour, Chair, Holiday
from apps.organizations.models import Membership

from .models import ACTIVE_APPOINTMENT_STATUSES, Appointment, TimeOff, WorkShift
from .services import AppointmentService


@dataclass(frozen=True)
class SlotOption:
    starts_at: datetime
    ends_at: datetime
    occupied_until: datetime
    dentist_ids: tuple[int, ...]
    chair_ids: tuple[int, ...]


class AvailabilityService:
    SLOT_STEP_MINUTES = 15

    @staticmethod
    def effective_duration(branch_service):
        duration = (
            branch_service.duration_minutes
            if branch_service.duration_minutes is not None
            else branch_service.service.standard_duration_minutes
        )
        buffer = (
            branch_service.buffer_minutes
            if branch_service.buffer_minutes is not None
            else branch_service.service.buffer_minutes
        )
        return duration, buffer

    @classmethod
    def list_slots(
        cls,
        *,
        branch_service,
        target_date,
        dentist=None,
        now=None,
        exclude_appointment_id=None,
    ):
        now = now or timezone.now()
        branch = branch_service.branch
        organization = branch.organization
        service = branch_service.service
        AppointmentService.expire_due_holds(now=now, branch_id=branch.pk)
        local_timezone = ZoneInfo(organization.timezone)
        local_now = now.astimezone(local_timezone)

        if target_date < local_now.date():
            return []
        if not branch.is_active or not service.is_active or not branch_service.is_active:
            return []

        opening = BranchOpeningHour.objects.filter(
            branch=branch,
            weekday=target_date.isoweekday(),
        ).first()
        if not opening or opening.is_closed:
            return []
        if Holiday.objects.filter(
            organization=organization,
            holiday_date=target_date,
            is_closed=True,
        ).filter(Q(branch=branch) | Q(branch__isnull=True)).exists():
            return []

        day_opens_at = datetime.combine(
            target_date,
            opening.open_time,
            tzinfo=local_timezone,
        )
        day_closes_at = datetime.combine(
            target_date,
            opening.close_time,
            tzinfo=local_timezone,
        )
        duration_minutes, buffer_minutes = cls.effective_duration(branch_service)

        dentists = Dentist.objects.filter(
            organization=organization,
            is_active=True,
            dentist_services__service=service,
            user__memberships__branch=branch,
            user__memberships__role=Membership.Role.DENTIST,
            user__memberships__is_active=True,
        ).distinct()
        if dentist is not None:
            dentists = dentists.filter(pk=dentist.pk)
        dentists = list(dentists.order_by("id_dentist"))
        chairs = list(
            Chair.objects.filter(branch=branch, is_active=True).order_by("id_chair")
        )
        if not dentists or not chairs:
            return []

        dentist_ids = [item.id_dentist for item in dentists]
        shifts_by_dentist = {dentist_id: [] for dentist_id in dentist_ids}
        for shift in WorkShift.objects.filter(
            dentist_id__in=dentist_ids,
            branch=branch,
            weekday=target_date.isoweekday(),
            valid_from__lte=target_date,
            is_active=True,
        ).filter(Q(valid_to__isnull=True) | Q(valid_to__gte=target_date)):
            shifts_by_dentist[shift.dentist_id].append(
                (
                    datetime.combine(
                        target_date,
                        shift.start_time,
                        tzinfo=local_timezone,
                    ),
                    datetime.combine(
                        target_date,
                        shift.end_time,
                        tzinfo=local_timezone,
                    ),
                )
            )

        time_offs_by_dentist = {dentist_id: [] for dentist_id in dentist_ids}
        for time_off in TimeOff.objects.filter(
            dentist_id__in=dentist_ids,
            is_active=True,
            starts_at__lt=day_closes_at,
            ends_at__gt=day_opens_at,
        ).filter(Q(branch=branch) | Q(branch__isnull=True)):
            time_offs_by_dentist[time_off.dentist_id].append(
                (time_off.starts_at, time_off.ends_at)
            )

        active_appointments_query = Appointment.objects.filter(
                Q(branch=branch) | Q(dentist_id__in=dentist_ids),
                status__in=ACTIVE_APPOINTMENT_STATUSES,
                starts_at__lt=day_closes_at,
                occupied_until__gt=day_opens_at,
            )
        if exclude_appointment_id is not None:
            active_appointments_query = active_appointments_query.exclude(
                pk=exclude_appointment_id
            )
        active_appointments = list(
            active_appointments_query.exclude(
                status=Appointment.Status.HELD,
                expires_at__lte=now,
            )
            .values("dentist_id", "chair_id", "starts_at", "occupied_until")
        )

        options = []
        slot_start = day_opens_at
        step = timedelta(minutes=cls.SLOT_STEP_MINUTES)
        duration = timedelta(minutes=duration_minutes)
        buffer = timedelta(minutes=buffer_minutes)

        while slot_start + duration + buffer <= day_closes_at:
            slot_end = slot_start + duration
            occupied_until = slot_end + buffer
            if slot_start > now:
                available_dentists = []
                for candidate in dentists:
                    within_shift = any(
                        shift_start <= slot_start and occupied_until <= shift_end
                        for shift_start, shift_end in shifts_by_dentist[
                            candidate.id_dentist
                        ]
                    )
                    has_time_off = any(
                        time_off_start < occupied_until and time_off_end > slot_start
                        for time_off_start, time_off_end in time_offs_by_dentist[
                            candidate.id_dentist
                        ]
                    )
                    has_appointment = any(
                        existing["dentist_id"] == candidate.id_dentist
                        and existing["starts_at"] < occupied_until
                        and existing["occupied_until"] > slot_start
                        for existing in active_appointments
                    )
                    if within_shift and not has_time_off and not has_appointment:
                        available_dentists.append(candidate.id_dentist)

                available_chairs = [
                    chair.id_chair
                    for chair in chairs
                    if not any(
                        existing["chair_id"] == chair.id_chair
                        and existing["starts_at"] < occupied_until
                        and existing["occupied_until"] > slot_start
                        for existing in active_appointments
                    )
                ]
                if available_dentists and available_chairs:
                    options.append(
                        SlotOption(
                            starts_at=slot_start,
                            ends_at=slot_end,
                            occupied_until=occupied_until,
                            dentist_ids=tuple(available_dentists),
                            chair_ids=tuple(available_chairs),
                        )
                    )
            slot_start += step

        return options

