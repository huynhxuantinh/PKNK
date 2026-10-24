import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import Membership, StaffInvitation


class InvalidStaffInvitation(Exception):
    pass


class ActivePatientAppointmentsExist(Exception):
    pass


@transaction.atomic
def deactivate_patient_memberships(
    user,
    *,
    actor_user=None,
    request=None,
    source="STAFF_ROLE_ASSIGNED",
):
    """A staff account is never simultaneously treated as a patient account."""
    from apps.audit.services import AuditService
    from apps.scheduling.models import ACTIVE_APPOINTMENT_STATUSES, Appointment

    has_active_appointments = (
        Appointment.objects.filter(
            patient_profile__user=user,
            status__in=ACTIVE_APPOINTMENT_STATUSES,
        )
        .exclude(
            status=Appointment.Status.HELD,
            expires_at__lte=timezone.now(),
        )
        .exists()
    )
    if has_active_appointments:
        raise ActivePatientAppointmentsExist(
            "Tài khoản còn lịch hẹn bệnh nhân đang hoạt động. "
            "Hãy hủy hoặc chuyển lịch trước khi gán quyền nhân viên."
        )
    memberships = list(
        Membership.objects.select_for_update(of=("self",))
        .select_related("organization", "branch")
        .filter(
            user=user,
            role=Membership.Role.PATIENT,
            is_active=True,
        )
    )
    if not memberships:
        return
    Membership.objects.filter(pk__in=[membership.pk for membership in memberships]).update(
        is_active=False
    )
    for membership in memberships:
        AuditService.record_write(
            actor_user=actor_user,
            organization=membership.organization,
            branch=membership.branch,
            action="PATIENT_MEMBERSHIP_AUTO_DEACTIVATED",
            resource_type="Membership",
            resource_id=membership.pk,
            before_data={"is_active": True},
            after_data={
                "is_active": False,
                "reason": "STAFF_ROLE_ASSIGNED",
                "source": source,
            },
            request=request,
        )


class StaffInvitationService:
    @staticmethod
    def digest(raw_token):
        return hashlib.sha256(raw_token.encode()).hexdigest()

    @classmethod
    @transaction.atomic
    def create(cls, *, organization, branch, email, role, invited_by):
        now = timezone.now()
        StaffInvitation.objects.select_for_update().filter(
            organization=organization,
            email__iexact=email,
            role=role,
            branch=branch,
            accepted_at__isnull=True,
            revoked_at__isnull=True,
        ).update(revoked_at=now)
        raw_token = secrets.token_urlsafe(32)
        invitation = StaffInvitation.objects.create(
            organization=organization,
            branch=branch,
            email=email.strip().lower(),
            role=role,
            token_digest=cls.digest(raw_token),
            invited_by=invited_by,
            expires_at=now + timedelta(hours=settings.STAFF_INVITATION_TTL_HOURS),
        )
        return invitation, raw_token

    @classmethod
    @transaction.atomic
    def accept(cls, *, raw_token, user, request=None):
        try:
            invitation = StaffInvitation.objects.select_for_update(of=("self",)).select_related(
                "organization", "branch"
            ).get(token_digest=cls.digest(raw_token))
        except StaffInvitation.DoesNotExist as error:
            raise InvalidStaffInvitation from error
        now = timezone.now()
        if (
            invitation.accepted_at is not None
            or invitation.revoked_at is not None
            or invitation.expires_at <= now
            or invitation.email.lower() != user.email.lower()
            or user.email_verified_at is None
            or not user.is_active
            or not invitation.organization.is_active
        ):
            raise InvalidStaffInvitation
        deactivate_patient_memberships(
            user,
            actor_user=user,
            request=request,
            source="STAFF_INVITATION_ACCEPTED",
        )
        membership, _ = Membership.objects.update_or_create(
            user=user,
            organization=invitation.organization,
            branch=invitation.branch,
            role=invitation.role,
            defaults={"is_active": True},
        )
        invitation.accepted_at = now
        invitation.save(update_fields=["accepted_at"])
        return membership, invitation
