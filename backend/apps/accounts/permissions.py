from rest_framework.permissions import BasePermission

from apps.organizations.models import Membership


STAFF_ROLES = (
    Membership.Role.DENTIST,
    Membership.Role.BRANCH_ADMIN,
    Membership.Role.ORGANIZATION_ADMIN,
)


def has_active_membership(user, roles):
    return bool(
        user
        and user.is_authenticated
        and user.is_active
        and Membership.objects.filter(
            user=user,
            role__in=roles,
            is_active=True,
        ).exists()
    )


class IsEmailVerified(BasePermission):
    message = "Bạn cần xác minh email trước khi đặt lịch."
    code = "email_not_verified"

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.email_verified_at is not None
        )


class IsPatientOnly(BasePermission):
    message = "Tài khoản nhân viên không thể sử dụng chức năng dành cho bệnh nhân."
    code = "patient_role_required"

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and not has_active_membership(user, STAFF_ROLES)
        )


class IsDentistOnly(BasePermission):
    message = "Chức năng này chỉ dành cho nha sĩ đang hoạt động."
    code = "dentist_role_required"

    def has_permission(self, request, view):
        return has_active_membership(request.user, (Membership.Role.DENTIST,))


class IsManagementStaff(BasePermission):
    message = "Chức năng này chỉ dành cho quản lý đang hoạt động."
    code = "management_role_required"

    def has_permission(self, request, view):
        return has_active_membership(
            request.user,
            (Membership.Role.BRANCH_ADMIN, Membership.Role.ORGANIZATION_ADMIN),
        )
