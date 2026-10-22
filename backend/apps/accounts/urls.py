from django.urls import path

from .views import (
    EmailVerificationConfirmAPIView,
    EmailVerificationResendAPIView,
    LoginAPIView,
    LogoutAPIView,
    MeAPIView,
    PasswordResetConfirmAPIView,
    PasswordResetRequestAPIView,
    RegistrationAPIView,
    TokenRefreshAPIView,
)

app_name = "accounts"

urlpatterns = [
    path("register/", RegistrationAPIView.as_view(), name="register"),
    path("login/", LoginAPIView.as_view(), name="login"),
    path("refresh/", TokenRefreshAPIView.as_view(), name="token-refresh"),
    path("logout/", LogoutAPIView.as_view(), name="logout"),
    path("me/", MeAPIView.as_view(), name="me"),
    path(
        "password-reset/request/",
        PasswordResetRequestAPIView.as_view(),
        name="password-reset-request",
    ),
    path(
        "password-reset/confirm/",
        PasswordResetConfirmAPIView.as_view(),
        name="password-reset-confirm",
    ),
    path(
        "email-verification/confirm/",
        EmailVerificationConfirmAPIView.as_view(),
        name="email-verification-confirm",
    ),
    path(
        "email-verification/resend/",
        EmailVerificationResendAPIView.as_view(),
        name="email-verification-resend",
    ),
]
