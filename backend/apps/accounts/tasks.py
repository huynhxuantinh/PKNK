from urllib.parse import urlencode

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

from .models import User
from .services import EmailVerificationService, PasswordResetService


@shared_task(
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
)
def send_email_verification(user_id):
    user = User.objects.filter(pk=user_id, is_active=True).first()
    if user is None or user.email_verified_at is not None:
        return 0

    raw_token = EmailVerificationService.issue_token(user)
    if raw_token is None:
        return 0

    query = urlencode({"token": raw_token})
    verification_url = f"{settings.FRONTEND_URL.rstrip('/')}/verify-email?{query}"
    return send_mail(
        subject="Xác minh email tài khoản phòng khám nha khoa",
        message=(
            f"Xin chào {user.full_name},\n\n"
            "Vui lòng mở liên kết sau để xác minh email:\n"
            f"{verification_url}"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


@shared_task(
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
)
def send_password_reset_email(email):
    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if user is None:
        return 0

    raw_token = PasswordResetService.issue_token(user)
    query = urlencode({"token": raw_token})
    reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?{query}"
    return send_mail(
        subject="Đặt lại mật khẩu tài khoản phòng khám nha khoa",
        message=(
            f"Xin chào {user.full_name},\n\n"
            "Mở liên kết sau để đặt lại mật khẩu. Liên kết chỉ dùng một lần:\n"
            f"{reset_url}"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )
