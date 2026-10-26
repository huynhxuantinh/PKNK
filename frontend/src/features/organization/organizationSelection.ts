import type { Membership, User } from '../../types/api'

export interface OrganizationOption {
  id: number
  name: string
}

export function organizationOptionsForUser(user: User | null): OrganizationOption[] {
  const byId = new Map<number, string>()
  user?.memberships
    ?.filter(
      (membership) =>
        membership.is_active && membership.role === 'ORGANIZATION_ADMIN',
    )
    .forEach((membership) => {
      if (!byId.has(membership.organization_id)) {
        byId.set(
          membership.organization_id,
          membership.organization_name || `Tổ chức #${membership.organization_id}`,
        )
      }
    })
  return Array.from(byId, ([id, name]) => ({ id, name }))
}

export function resolveOrganizationId(
  requestedOrganizationId: number | null,
  allowedOrganizationIds: number[],
) {
  if (
    requestedOrganizationId
    && allowedOrganizationIds.includes(requestedOrganizationId)
  ) {
    return requestedOrganizationId
  }
  return allowedOrganizationIds[0] ?? null
}

export function organizationRoleLabel(role: Membership['role']) {
  if (role === 'ORGANIZATION_ADMIN') return 'Quản trị tổ chức'
  if (role === 'BRANCH_ADMIN') return 'Quản lý chi nhánh'
  if (role === 'DENTIST') return 'Nha sĩ'
  return 'Bệnh nhân'
}
