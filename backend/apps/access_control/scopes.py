from django.db.models import F, Q

from apps.locations.models import Branch
from apps.organizations.models import Membership


def _active_memberships(user):
    if not user or not user.is_authenticated or not user.is_active:
        return Membership.objects.none()
    return Membership.objects.filter(
        user=user,
        is_active=True,
        organization__is_active=True,
    )


def organization_ids_for(user, roles=None):
    memberships = _active_memberships(user)
    if roles:
        memberships = memberships.filter(role__in=roles)
    return memberships.values_list("organization_id", flat=True).distinct()


def branch_ids_for(user, roles=None, *, inherit_organization_admin=True):
    memberships = _active_memberships(user)
    requested_roles = set(roles or ())
    direct = memberships.filter(
        branch__isnull=False,
        branch__is_active=True,
        branch__organization_id=F("organization_id"),
    )
    if requested_roles:
        direct = direct.filter(role__in=requested_roles)

    condition = Q(pk__in=direct.values("branch_id"))
    if inherit_organization_admin and (
        not requested_roles
        or Membership.Role.ORGANIZATION_ADMIN in requested_roles
        or Membership.Role.BRANCH_ADMIN in requested_roles
    ):
        admin_organizations = memberships.filter(
            role=Membership.Role.ORGANIZATION_ADMIN,
            branch__isnull=True,
        ).values("organization_id")
        condition |= Q(organization_id__in=admin_organizations)

    return Branch.objects.filter(condition, is_active=True).values_list(
        "id_branch", flat=True
    )


def has_organization_role(user, organization_id, roles):
    return organization_ids_for(user, roles).filter(
        organization_id=organization_id
    ).exists()


def has_branch_role(user, branch_id, roles, *, inherit_organization_admin=True):
    return branch_ids_for(
        user,
        roles,
        inherit_organization_admin=inherit_organization_admin,
    ).filter(id_branch=branch_id).exists()


def scope_queryset_to_organizations(queryset, user, roles, lookup="organization_id"):
    return queryset.filter(**{f"{lookup}__in": organization_ids_for(user, roles)})


def scope_queryset_to_branches(queryset, user, roles, lookup="branch_id"):
    return queryset.filter(**{f"{lookup}__in": branch_ids_for(user, roles)})

