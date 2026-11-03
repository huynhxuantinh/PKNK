import logging
from urllib.parse import urlencode

from celery import shared_task
from django.conf import settings
from django.db import transaction

from apps.notifications.emailing import send_branded_email

from .models import User
from .services import EmailVerificationService, PasswordResetService


logger = logging.getLogger(__name__)


@shared_task(
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
)
def send_email_verification(user_id, return_to=""):
    # The replacement token and email delivery intentionally share one
    # transaction. If SMTP/Resend fails, retrying the task rolls back the
    # invalidation of the link that was already delivered to the user.
    with transaction.atomic():
        user = (
            User.objects.select_for_update()
            .filter(pk=user_id, is_active=True)
            .first()
        )
        if user is None or user.email_verified_at is not None:
            return 0

        raw_token = EmailVerificationService.issue_token(user)
        if raw_token is None:
            return 0

        query_params = {"token": raw_token}
        if return_to:
            query_params["returnTo"] = return_to
        query = urlencode(query_params)
        verification_url = f"{settings.FRONTEND_URL.rstrip('/')}/verify-email?{query}"
        try:
            return send_branded_email(
                subject="Xác minh email tài khoản DentaVie",
                recipient=user.email,
                heading="Xác minh email của bạn",
                message=(
                    f"Xin chào {user.full_name},\n\n"
                    "Bạn vừa đăng ký tài khoản DentaVie. Hãy xác minh email để hoàn tất đăng ký và đặt lịch khám."
                ),
                action_label="Xác minh email",
                action_url=verification_url,
            )
        except Exception:
            logger.exception("Email verification delivery failed; Celery will retry.")
            raise


@shared_task(
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
)
def send_password_reset_email(email, return_to=""):
    # See the verification task above: a failed delivery must not consume a
    # reset link that the mailbox owner may still be using.
    with transaction.atomic():
        user = (
            User.objects.select_for_update()
            .filter(email__iexact=email, is_active=True)
            .first()
        )
        if user is None:
            return 0

        raw_token = PasswordResetService.issue_token(user)
        query_params = {"token": raw_token}
        if return_to:
            query_params["returnTo"] = return_to
        query = urlencode(query_params)
        reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?{query}"
        try:
            return send_branded_email(
                subject="Đặt lại mật khẩu DentaVie",
                recipient=user.email,
                heading="Đặt lại mật khẩu",
                message=(
                    f"Xin chào {user.full_name},\n\n"
                    "Bạn đã yêu cầu đặt lại mật khẩu. Liên kết này chỉ sử dụng một lần."
                ),
                action_label="Đặt lại mật khẩu",
                action_url=reset_url,
            )
        except Exception:
            logger.exception("Password reset email delivery failed; Celery will retry.")
            raise
