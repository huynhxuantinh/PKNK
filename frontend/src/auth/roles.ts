import type { Membership, User } from '../types/api'

export type ProtectedArea = 'AUTHENTICATED' | 'PATIENT' | 'DENTIST' | 'MANAGEMENT' | 'ORGANIZATION'

const STAFF_ROLES: Membership['role'][] = [
  'DENTIST',
  'BRANCH_ADMIN',
  'ORGANIZATION_ADMIN',
]

export function hasActiveRole(user: User | null, roles: Membership['role'][]) {
  return Boolean(
    user?.memberships?.some(
      (membership) => membership.is_active && roles.includes(membership.role),
    ),
  )
}

export function activeBranchIdsForRole(user: User | null, role: Membership['role']) {
  return Array.from(new Set(
    user?.memberships
      ?.filter(
        (membership) => membership.is_active
          && membership.role === role
          && typeof membership.branch_id === 'number',
      )
      .map((membership) => membership.branch_id as number) ?? [],
  ))
}

export function activeOrganizationIdsForRole(user: User | null, role: Membership['role']) {
  return Array.from(new Set(
    user?.memberships
      ?.filter(
        (membership) => membership.is_active && membership.role === role,
      )
      .map((membership) => membership.organization_id) ?? [],
  ))
}

export function isStaffUser(user: User | null) {
  return hasActiveRole(user, STAFF_ROLES)
}

export function canAccessArea(user: User | null, area: ProtectedArea) {
  if (!user) return false
  if (area === 'AUTHENTICATED') return true
  if (area === 'PATIENT') return !isStaffUser(user)
  if (area === 'DENTIST') return hasActiveRole(user, ['DENTIST'])
  if (area === 'ORGANIZATION') return hasActiveRole(user, ['ORGANIZATION_ADMIN'])
  return hasActiveRole(user, ['BRANCH_ADMIN', 'ORGANIZATION_ADMIN'])
}
