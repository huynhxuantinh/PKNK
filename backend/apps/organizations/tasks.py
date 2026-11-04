import hmac
import logging
from datetime import timedelta
from zoneinfo import ZoneInfo

from celery import Task, shared_task
from django.conf import settings
from django.utils import timezone

from apps.notifications.emailing import send_branded_email

from .models import StaffInvitation
from .services import StaffInvitationService

logger = logging.getLogger(__name__)


@shared_task
def archive_expired_staff_invitations():
    """Hide stale invitations while retaining them for audit purposes."""
    now = timezone.now()
    cutoff = now - timedelta(days=settings.STAFF_INVITATION_RETENTION_DAYS)
    return StaffInvitation.objects.filter(
        accepted_at__isnull=True,
        revoked_at__isnull=True,
        expires_at__lte=cutoff,
    ).update(revoked_at=now)


class StaffInvitationEmailTask(Task):
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        invitation_id = args[0] if args else kwargs.get("invitation_id")
        if invitation_id:
            StaffInvitation.objects.filter(pk=invitation_id).update(
                email_delivery_status=StaffInvitation.EmailDeliveryStatus.FAILED,
                email_failed_at=timezone.now(),
            )
        logger.error(
            "Gửi email mời nhân viên thất bại sau khi retry invitation_id=%s task_id=%s",
            invitation_id,
            task_id,
            exc_info=einfo.exc_info,
        )
        super().on_failure(exc, task_id, args, kwargs, einfo)


def _invitation_is_deliverable(invitation, raw_token, now):
    """Re-check state right before sending: the row may have been superseded."""
    if (
        invitation.accepted_at is not None
        or invitation.revoked_at is not None
        or invitation.expires_at <= now
        or not invitation.organization.is_active
        or (invitation.branch_id is not None and not invitation.branch.is_active)
    ):
        return False
    return hmac.compare_digest(
        invitation.token_digest, StaffInvitationService.digest(raw_token)
    )


@shared_task(
    base=StaffInvitationEmailTask,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
)
def send_staff_invitation_email(invitation_id, raw_token):
    invitation = StaffInvitation.objects.select_related(
        "organization", "branch", "invited_by"
    ).get(pk=invitation_id)
    if not _invitation_is_deliverable(invitation, raw_token, timezone.now()):
        logger.info(
            "Bỏ qua email mời không còn hợp lệ invitation_id=%s", invitation_id
        )
        return None
    url = f"{settings.FRONTEND_URL.rstrip('/')}/accept-invitation?token={raw_token}"
    inviter_name = invitation.invited_by.full_name or invitation.invited_by.email
    scope_name = invitation.branch.name if invitation.branch else "toàn hệ thống"
    expires_at = timezone.localtime(
        invitation.expires_at,
        timezone=ZoneInfo(invitation.organization.timezone),
    ).strftime("%H:%M ngày %d/%m/%Y")
    result = send_branded_email(
        subject=f"Lời mời tham gia {invitation.organization.name}",
        recipient=invitation.email,
        heading="Bạn được mời tham gia DentaVie",
        message=(
            f"Quản trị viên {inviter_name} mời bạn làm "
            f"{invitation.get_role_display()} tại {scope_name} của "
            f"{invitation.organization.name}.\n"
            f"Liên kết có hiệu lực đến {expires_at}."
        ),
        action_label="Xem lời mời",
        action_url=url,
    )
    StaffInvitation.objects.filter(pk=invitation_id).update(
        email_delivery_status=StaffInvitation.EmailDeliveryStatus.SENT,
        email_sent_at=timezone.now(),
        email_failed_at=None,
    )
    return result
