from rest_framework.permissions import BasePermission

from .scopes import has_branch_role, has_organization_role


class HasOrganizationRole(BasePermission):
    message = "Bạn không có quyền trong tổ chức này."

    def has_permission(self, request, view):
        roles = getattr(view, "organization_roles", ())
        organization_id = view.kwargs.get("organization_id")
        if organization_id is None:
            return False
        return has_organization_role(request.user, organization_id, roles)


class HasBranchRole(BasePermission):
    message = "Bạn không có quyền tại chi nhánh này."

    def has_permission(self, request, view):
        roles = getattr(view, "branch_roles", ())
        branch_id = view.kwargs.get("branch_id")
        if branch_id is None:
            return False
        return has_branch_role(request.user, branch_id, roles)

