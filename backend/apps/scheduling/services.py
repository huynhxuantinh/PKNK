from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.organizations.models import Membership
from apps.audit.services import AuditService

from .models import Appointment, AppointmentStatusHistory


ALLOWED_TRANSITIONS = {
    Appointment.Status.HELD: {
        Appointment.Status.PENDING,
        Appointment.Status.CONFIRMED,
        Appointment.Status.CANCELLED,
        Appointment.Status.EXPIRED,
    },
    Appointment.Status.PENDING: {
        Appointment.Status.CONFIRMED,
        Appointment.Status.CANCELLED,
    },
    Appointment.Status.CONFIRMED: {
        Appointment.Status.CHECKED_IN,
        Appointment.Status.CANCELLED,
        Appointment.Status.NO_SHOW,
    },
    Appointment.Status.CHECKED_IN: {
        Appointment.Status.IN_PROGRESS,
        Appointment.Status.CANCELLED,
    },
    Appointment.Status.IN_PROGRESS: {Appointment.Status.COMPLETED},
}

ALLOWED_ACTORS = {
    (Appointment.Status.HELD, Appointment.Status.PENDING): {
        AppointmentStatusHistory.ActorType.PATIENT,
    },
    (Appointment.Status.HELD, Appointment.Status.CONFIRMED): {
        AppointmentStatusHistory.ActorType.PATIENT,
    },
    (Appointment.Status.HELD, Appointment.Status.CANCELLED): {
        AppointmentStatusHistory.ActorType.PATIENT,
    },
    (Appointment.Status.HELD, Appointment.Status.EXPIRED): {
        AppointmentStatusHistory.ActorType.SYSTEM,
    },
    (Appointment.Status.PENDING, Appointment.Status.CONFIRMED): {
        AppointmentStatusHistory.ActorType.BRANCH_ADMIN,
        AppointmentStatusHistory.ActorType.ORGANIZATION_ADMIN,
    },
    (Appointment.Status.PENDING, Appointment.Status.CANCELLED): {
        AppointmentStatusHistory.ActorType.PATIENT,
        AppointmentStatusHistory.ActorType.BRANCH_ADMIN,
        AppointmentStatusHistory.ActorType.ORGANIZATION_ADMIN,
    },
    (Appointment.Status.CONFIRMED, Appointment.Status.CHECKED_IN): {
        AppointmentStatusHistory.ActorType.BRANCH_ADMIN,
        AppointmentStatusHistory.ActorType.ORGANIZATION_ADMIN,
    },
    (Appointment.Status.CONFIRMED, Appointment.Status.CANCELLED): {
        AppointmentStatusHistory.ActorType.PATIENT,
        AppointmentStatusHistory.ActorType.BRANCH_ADMIN,
        AppointmentStatusHistory.ActorType.ORGANIZATION_ADMIN,
    },
    (Appointment.Status.CONFIRMED, Appointment.Status.NO_SHOW): {
        AppointmentStatusHistory.ActorType.BRANCH_ADMIN,
        AppointmentStatusHistory.ActorType.ORGANIZATION_ADMIN,
    },
    (Appointment.Status.CHECKED_IN, Appointment.Status.IN_PROGRESS): {
        AppointmentStatusHistory.ActorType.DENTIST,
    },
    (Appointment.Status.CHECKED_IN, Appointment.Status.CANCELLED): {
        AppointmentStatusHistory.ActorType.BRANCH_ADMIN,
        AppointmentStatusHistory.ActorType.ORGANIZATION_ADMIN,
    },
    (Appointment.Status.IN_PROGRESS, Appointment.Status.COMPLETED): {
        AppointmentStatusHistory.ActorType.DENTIST,
    },
}


class AppointmentService:
    CHECK_IN_EARLY_MINUTES = 30

    @classmethod
    def expire_due_holds(cls, *, now=None, branch_id=None):
        now = now or timezone.now()
        expired_count = 0
        appointments = Appointment.objects.filter(
            status=Appointment.Status.HELD,
            expires_at__lte=now,
        )
        if branch_id is not None:
            appointments = appointments.filter(branch_id=branch_id)
        appointment_ids = list(
            appointments.values_list("id_appointment", flat=True)
        )
        for appointment_id in appointment_ids:
            try:
                cls.transition_status(
                    appointment_id=appointment_id,
                    to_status=Appointment.Status.EXPIRED,
                    actor_type=AppointmentStatusHistory.ActorType.SYSTEM,
                    occurred_at=now,
                )
            except (Appointment.DoesNotExist, ValidationError):
                continue
            else:
                expired_count += 1
        return expired_count

    @staticmethod
    def _validate_actor(appointment, from_status, to_status, actor_type, actor_user):
        allowed_actor_types = ALLOWED_ACTORS[(from_status, to_status)]
        if actor_type not in allowed_actor_types:
            raise ValidationError("Vai trò không được phép thực hiện chuyển trạng thái này.")

        if actor_type == AppointmentStatusHistory.ActorType.SYSTEM:
            if actor_user is not None:
                raise ValidationError("Thao tác hệ thống không được gắn người dùng.")
            return

        if actor_user is None:
            raise ValidationError("Thao tác này bắt buộc có người thực hiện.")

        if actor_type == AppointmentStatusHistory.ActorType.PATIENT:
            if actor_user.pk != appointment.patient_profile.user_id:
                raise ValidationError("Bệnh nhân không sở hữu lịch hẹn này.")
            return

        if actor_type == AppointmentStatusHistory.ActorType.DENTIST:
            has_active_scope = Membership.objects.filter(
                user=actor_user,
                organization=appointment.branch.organization,
                branch=appointment.branch,
                role=Membership.Role.DENTIST,
                is_active=True,
            ).exists()
            if (
                actor_user.pk != appointment.dentist.user_id
                or not actor_user.is_active
                or not appointment.dentist.is_active
                or appointment.dentist.organization_id
                != appointment.branch.organization_id
                or not appointment.branch.is_active
                or not appointment.branch.organization.is_active
                or not has_active_scope
            ):
                raise ValidationError("Chỉ nha sĩ được phân công mới được thao tác.")
            return

        role = (
            Membership.Role.BRANCH_ADMIN
            if actor_type == AppointmentStatusHistory.ActorType.BRANCH_ADMIN
            else Membership.Role.ORGANIZATION_ADMIN
        )
        if not actor_user.is_active or not appointment.branch.organization.is_active:
            raise ValidationError("Tài khoản hoặc organization đã ngưng hoạt động.")

        memberships = Membership.objects.filter(
            user=actor_user,
            organization=appointment.branch.organization,
            role=role,
            is_active=True,
        )
        if role == Membership.Role.BRANCH_ADMIN:
            memberships = memberships.filter(branch=appointment.branch)
        else:
            memberships = memberships.filter(branch__isnull=True)
        if not memberships.exists():
            raise ValidationError("Người dùng không có quyền quản lý lịch hẹn này.")

    @staticmethod
    def _validate_time_rules(appointment, to_status, actor_type, occurred_at):
        if appointment.status == Appointment.Status.HELD and to_status in {
            Appointment.Status.PENDING,
            Appointment.Status.CONFIRMED,
        }:
            if appointment.expires_at is None or occurred_at >= appointment.expires_at:
                raise ValidationError("Chỗ giữ đã hết hạn.")

        if to_status == Appointment.Status.EXPIRED:
            if appointment.expires_at is None or occurred_at < appointment.expires_at:
                raise ValidationError("Chưa đến thời điểm hết hạn giữ chỗ.")

        if (
            to_status == Appointment.Status.CANCELLED
            and actor_type == AppointmentStatusHistory.ActorType.PATIENT
            and appointment.status
            in {Appointment.Status.PENDING, Appointment.Status.CONFIRMED}
        ):
            cutoff = timedelta(
                minutes=appointment.branch.organization.cancellation_cutoff_minutes
            )
            if occurred_at > appointment.starts_at - cutoff:
                raise ValidationError("Đã quá hạn bệnh nhân được phép hủy lịch.")

        if to_status == Appointment.Status.NO_SHOW:
            grace = timedelta(
                minutes=appointment.branch.organization.no_show_grace_minutes
            )
            if occurred_at < appointment.starts_at + grace:
                raise ValidationError("Chưa hết thời gian ân hạn để đánh dấu không đến.")

        if to_status == Appointment.Status.CHECKED_IN:
            check_in_opens_at = appointment.starts_at - timedelta(
                minutes=AppointmentService.CHECK_IN_EARLY_MINUTES
            )
            check_in_closes_at = appointment.starts_at + timedelta(
                minutes=appointment.branch.organization.no_show_grace_minutes
            )
            if occurred_at < check_in_opens_at:
                raise ValidationError(
                    "Chỉ có thể check-in trong vòng 30 phút trước giờ hẹn."
                )
            if occurred_at > check_in_closes_at:
                raise ValidationError(
                    "Đã quá thời gian check-in. Vui lòng xử lý theo quy trình không đến."
                )

    @classmethod
    @transaction.atomic
    def transition_status(
        cls,
        *,
        appointment_id,
        to_status,
        actor_type,
        actor_user=None,
        reason=None,
        occurred_at=None,
        request=None,
        notify=True,
    ):
        occurred_at = occurred_at or timezone.now()
        appointment = (
            Appointment.objects.select_for_update()
            .select_related(
                "patient_profile__user",
                "dentist__user",
                "branch__organization",
            )
            .get(pk=appointment_id)
        )
        from_status = appointment.status

        if to_status not in ALLOWED_TRANSITIONS.get(from_status, set()):
            raise ValidationError(
                f"Không thể chuyển lịch từ {from_status} sang {to_status}."
            )

        cls._validate_actor(
            appointment,
            from_status,
            to_status,
            actor_type,
            actor_user,
        )
        cls._validate_time_rules(appointment, to_status, actor_type, occurred_at)
        if to_status == Appointment.Status.COMPLETED:
            from apps.clinical.services import validate_appointment_completion

            validate_appointment_completion(appointment)

        update_fields = ["status", "updated_at"]
        appointment.status = to_status

        timestamp_fields = {
            Appointment.Status.CONFIRMED: "confirmed_at",
            Appointment.Status.CHECKED_IN: "checked_in_at",
            Appointment.Status.IN_PROGRESS: "started_at",
            Appointment.Status.COMPLETED: "completed_at",
            Appointment.Status.CANCELLED: "cancelled_at",
            Appointment.Status.NO_SHOW: "no_show_at",
        }
        timestamp_field = timestamp_fields.get(to_status)
        if timestamp_field:
            setattr(appointment, timestamp_field, occurred_at)
            update_fields.append(timestamp_field)

        if to_status == Appointment.Status.CANCELLED:
            if not reason or not reason.strip():
                raise ValidationError("Hủy lịch phải có lý do.")
            appointment.cancel_reason = reason.strip()
            appointment.cancelled_by = actor_user
            update_fields.extend(["cancel_reason", "cancelled_by"])

        appointment.save(update_fields=update_fields)
        AppointmentStatusHistory.objects.create(
            appointment=appointment,
            from_status=from_status,
            to_status=to_status,
            actor_user=actor_user,
            actor_type=actor_type,
            reason=reason.strip() if reason else None,
        )
        AuditService.record_write(
            actor_user=actor_user,
            organization=appointment.branch.organization,
            branch=appointment.branch,
            action="APPOINTMENT_STATUS_CHANGED",
            resource_type="Appointment",
            resource_id=appointment.pk,
            before_data={"status": from_status},
            after_data={"status": to_status},
            request=request,
        )
        if notify:
            from apps.notifications.services import NotificationService

            NotificationService.publish_appointment_transition(
                appointment=appointment,
                from_status=from_status,
                to_status=to_status,
            )
        return appointment

    @classmethod
    def confirm_hold(cls, *, appointment_id, patient_user, request=None):
        appointment = Appointment.objects.select_related(
            "branch__organization"
        ).get(pk=appointment_id)
        # A network failure can leave the browser unsure whether the first
        # confirmation reached the server. Returning an already-confirmed
        # appointment makes a retry safe instead of reporting a false conflict.
        if appointment.status in {
            Appointment.Status.PENDING,
            Appointment.Status.CONFIRMED,
            Appointment.Status.CHECKED_IN,
            Appointment.Status.IN_PROGRESS,
            Appointment.Status.COMPLETED,
        }:
            return appointment
        target_status = (
            Appointment.Status.CONFIRMED
            if appointment.branch.organization.auto_confirm
            else Appointment.Status.PENDING
        )
        return cls.transition_status(
            appointment_id=appointment_id,
            to_status=target_status,
            actor_type=AppointmentStatusHistory.ActorType.PATIENT,
            actor_user=patient_user,
            request=request,
        )

