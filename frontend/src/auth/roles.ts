import type { Membership, User } from '../types/api'

export type ProtectedArea = 'PATIENT' | 'DENTIST' | 'MANAGEMENT'

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

export function isStaffUser(user: User | null) {
  return hasActiveRole(user, STAFF_ROLES)
}

export function canAccessArea(user: User | null, area: ProtectedArea) {
  if (!user) return false
  if (area === 'PATIENT') return !isStaffUser(user)
  if (area === 'DENTIST') return hasActiveRole(user, ['DENTIST'])
  return hasActiveRole(user, ['BRANCH_ADMIN', 'ORGANIZATION_ADMIN'])
}
