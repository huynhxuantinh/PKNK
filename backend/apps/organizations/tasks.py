import logging
from zoneinfo import ZoneInfo

from celery import Task, shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import StaffInvitation

logger = logging.getLogger(__name__)


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
    url = f"{settings.FRONTEND_URL.rstrip('/')}/accept-invitation?token={raw_token}"
    inviter_name = invitation.invited_by.full_name or invitation.invited_by.email
    scope_name = invitation.branch.name if invitation.branch else "toàn hệ thống"
    expires_at = timezone.localtime(
        invitation.expires_at,
        timezone=ZoneInfo(invitation.organization.timezone),
    ).strftime("%H:%M ngày %d/%m/%Y")
    result = send_mail(
        subject=f"Lời mời tham gia {invitation.organization.name}",
        message=(
            f"Quản trị viên {inviter_name} mời bạn làm "
            f"{invitation.get_role_display()} tại {scope_name} của "
            f"{invitation.organization.name}.\n"
            f"Liên kết có hiệu lực đến {expires_at}.\n\n"
            "Xem và chấp nhận lời mời tại:\n"
            f"{url}"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[invitation.email],
        fail_silently=False,
    )
    StaffInvitation.objects.filter(pk=invitation_id).update(
        email_delivery_status=StaffInvitation.EmailDeliveryStatus.SENT,
        email_sent_at=timezone.now(),
        email_failed_at=None,
    )
    return result
