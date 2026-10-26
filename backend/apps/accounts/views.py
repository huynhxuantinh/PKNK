import logging

from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.exceptions import Throttled, ValidationError as DRFValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from apps.audit.services import AuditService

from .models import User
from .serializers import (
    AuthResponseSerializer,
    EmailVerificationConfirmSerializer,
    EmailVerificationResendSerializer,
    InvalidCredentials,
    LoginSerializer,
    LogoutSerializer,
    MessageResponseSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    PasswordChangeSerializer,
    RegistrationSerializer,
    TokenRefreshResponseSerializer,
    UserResponseSerializer,
    UserSerializer,
    token_pair_for_user,
)
from .services import (
    EmailVerificationService,
    InvalidEmailVerificationToken,
    InvalidCurrentPassword,
    InvalidPasswordResetToken,
    PasswordChangeService,
    PasswordResetService,
    RegistrationService,
)
from .tasks import send_email_verification, send_password_reset_email
from .throttles import EmailScopedRateThrottle


logger = logging.getLogger(__name__)


def queue_verification_email(user_id):
    try:
        send_email_verification.delay(user_id)
    except Exception:
        logger.exception("Không thể đưa email xác minh vào hàng đợi.")


def queue_password_reset_email(email):
    try:
        send_password_reset_email.delay(email)
    except Exception:
        logger.exception("Không thể đưa email đặt lại mật khẩu vào hàng đợi.")


def user_with_access_context(user_id):
    return (
        User.objects.prefetch_related(
            "memberships__organization",
            "memberships__branch",
        )
        .get(pk=user_id)
    )


REGISTRATION_MESSAGE = "Nếu thông tin hợp lệ, email xác minh sẽ được gửi."
LOGIN_LOCK_SECONDS = 15 * 60
LOGIN_MAX_FAILURES = 5


def login_cache_key(kind, email):
    import hashlib

    digest = hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()
    return f"auth_login:{kind}:{digest}"


class RegistrationAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle, EmailScopedRateThrottle]
    throttle_scope = "auth_register"

    @extend_schema(request=RegistrationSerializer, responses={202: MessageResponseSerializer})
    def post(self, request):
        serializer = RegistrationSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        try:
            user = serializer.save()
        except IntegrityError:
            user = RegistrationService.replace_unverified_patient_registration(
                email=serializer.validated_data["email"],
                full_name=serializer.validated_data["full_name"],
                phone=serializer.validated_data["phone"],
                ip_address=request.META.get("REMOTE_ADDR"),
                user_agent=request.META.get("HTTP_USER_AGENT"),
            )
        if user is not None:
            queue_verification_email(user.pk)
        return Response(
            {"data": {"message": REGISTRATION_MESSAGE}},
            status=status.HTTP_202_ACCEPTED,
        )


class LoginAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle, EmailScopedRateThrottle]
    throttle_scope = "auth_login"

    @extend_schema(request=LoginSerializer, responses={200: AuthResponseSerializer})
    def post(self, request):
        email = str(request.data.get("email", "")).strip().lower()
        if email and cache.get(login_cache_key("locked", email)):
            raise Throttled(wait=LOGIN_LOCK_SECONDS)
        serializer = LoginSerializer(data=request.data, context={"request": request})
        try:
            serializer.is_valid(raise_exception=True)
        except InvalidCredentials:
            AuditService.record_write(
                action="LOGIN_FAILED",
                resource_type="User",
                after_data={"result": "DENIED"},
                request=request,
            )
            if email:
                failures_key = login_cache_key("failures", email)
                if cache.add(failures_key, 1, timeout=LOGIN_LOCK_SECONDS):
                    failures = 1
                else:
                    failures = cache.incr(failures_key)
                if failures >= LOGIN_MAX_FAILURES:
                    cache.set(login_cache_key("locked", email), True, timeout=LOGIN_LOCK_SECONDS)
                    cache.delete(failures_key)
            raise
        user = user_with_access_context(serializer.validated_data["user"].pk)
        cache.delete(login_cache_key("failures", email))
        cache.delete(login_cache_key("locked", email))
        AuditService.record_write(
            actor_user=user,
            action="LOGIN_SUCCEEDED",
            resource_type="User",
            resource_id=user.pk,
            after_data={"result": "ALLOWED"},
            request=request,
        )
        return Response(
            {
                "data": {
                    "user": UserSerializer(user).data,
                    "tokens": token_pair_for_user(user),
                }
            }
        )


class TokenRefreshAPIView(TokenRefreshView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_refresh"

    @extend_schema(
        request=TokenRefreshSerializer,
        responses={200: TokenRefreshResponseSerializer},
    )
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        response.data = {"data": response.data}
        return response


class LogoutAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=LogoutSerializer, responses={204: None})
    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token = RefreshToken(serializer.validated_data["refresh"])
            if str(token["user_id"]) != str(request.user.pk):
                raise AuthenticationFailed("Token không thuộc tài khoản hiện tại.")
            token.blacklist()
        except TokenError as error:
            raise AuthenticationFailed("Refresh token không hợp lệ.") from error
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: UserResponseSerializer})
    def get(self, request):
        user = user_with_access_context(request.user.pk)
        return Response({"data": UserSerializer(user).data})


class PasswordChangeAPIView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_change"

    @extend_schema(
        request=PasswordChangeSerializer,
        responses={200: MessageResponseSerializer},
    )
    @transaction.atomic
    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            PasswordChangeService.change_password(
                user_id=request.user.pk,
                current_password=serializer.validated_data["current_password"],
                new_password=serializer.validated_data["new_password"],
            )
        except InvalidCurrentPassword as error:
            raise DRFValidationError(
                {"current_password": "Mật khẩu hiện tại không đúng."}
            ) from error
        except DjangoValidationError as error:
            raise DRFValidationError({"new_password": error.messages}) from error

        AuditService.record_write(
            actor_user=request.user,
            action="PASSWORD_CHANGED",
            resource_type="User",
            resource_id=request.user.pk,
            after_data={"refresh_tokens_revoked": True},
            request=request,
        )
        return Response(
            {"data": {"message": "Đã đổi mật khẩu. Vui lòng đăng nhập lại."}}
        )


class EmailVerificationConfirmAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "email_verification_confirm"

    @extend_schema(
        request=EmailVerificationConfirmSerializer,
        responses={200: UserResponseSerializer},
    )
    def post(self, request):
        serializer = EmailVerificationConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = EmailVerificationService.verify_token(
                serializer.validated_data["token"],
                serializer.validated_data["new_password"],
            )
        except InvalidEmailVerificationToken as error:
            raise DRFValidationError(
                {"token": "Liên kết xác minh không hợp lệ hoặc đã hết hạn."}
            ) from error
        except DjangoValidationError as error:
            raise DRFValidationError({"new_password": error.messages}) from error

        user = user_with_access_context(user.pk)
        return Response({"data": UserSerializer(user).data})


class EmailVerificationResendAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle, EmailScopedRateThrottle]
    throttle_scope = "email_verification_resend"

    @extend_schema(
        request=EmailVerificationResendSerializer,
        responses={202: MessageResponseSerializer},
    )
    def post(self, request):
        serializer = EmailVerificationResendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(
            email__iexact=serializer.validated_data["email"],
            is_active=True,
            email_verified_at__isnull=True,
        ).first()
        if user is not None:
            queue_verification_email(user.pk)
        return Response(
            {"data": {"message": "Nếu cần xác minh, email mới sẽ được gửi."}},
            status=status.HTTP_202_ACCEPTED,
        )


class PasswordResetRequestAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle, EmailScopedRateThrottle]
    throttle_scope = "password_reset_request"

    @extend_schema(
        request=PasswordResetRequestSerializer,
        responses={202: MessageResponseSerializer},
    )
    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        queue_password_reset_email(serializer.validated_data["email"])
        return Response(
            {
                "data": {
                    "message": "Nếu email hợp lệ, liên kết đặt lại mật khẩu sẽ được gửi."
                }
            },
            status=status.HTTP_202_ACCEPTED,
        )


class PasswordResetConfirmAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset_confirm"

    @extend_schema(
        request=PasswordResetConfirmSerializer,
        responses={200: MessageResponseSerializer},
    )
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            PasswordResetService.reset_password(
                raw_token=serializer.validated_data["token"],
                new_password=serializer.validated_data["new_password"],
            )
        except InvalidPasswordResetToken as error:
            raise DRFValidationError(
                {"token": "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn."}
            ) from error
        except DjangoValidationError as error:
            raise DRFValidationError({"new_password": error.messages}) from error

        return Response(
            {"data": {"message": "Mật khẩu đã được đặt lại thành công."}}
        )
