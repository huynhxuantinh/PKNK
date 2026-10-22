from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

from .models import StaffInvitation


@shared_task
def send_staff_invitation_email(invitation_id, raw_token):
    invitation = StaffInvitation.objects.select_related("organization").get(pk=invitation_id)
    url = f"{settings.FRONTEND_URL.rstrip('/')}/accept-invitation?token={raw_token}"
    send_mail(
        subject=f"Lời mời tham gia {invitation.organization.name}",
        message=(
            "Bạn được mời tham gia hệ thống quản lý phòng khám. "
            "Hãy đăng ký/xác minh đúng email này rồi mở liên kết:\n"
            f"{url}"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[invitation.email],
    )
