from rest_framework.permissions import BasePermission


class IsEmailVerified(BasePermission):
    message = "Bạn cần xác minh email trước khi đặt lịch."
    code = "email_not_verified"

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.email_verified_at is not None
        )
