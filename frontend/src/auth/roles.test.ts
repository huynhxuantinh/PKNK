import { describe, expect, it } from 'vitest'

import type { User } from '../types/api'
import { activeBranchIdsForRole, activeOrganizationIdsForRole, canAccessArea, isStaffUser } from './roles'

function userWithRole(role: NonNullable<User['memberships']>[number]['role'], isActive = true): User {
  return {
    id_user: 1,
    email: 'role@example.com',
    full_name: 'Role Test',
    email_verified: true,
    email_verified_at: '2026-10-23T00:00:00Z',
    memberships: [{
      role,
      is_active: isActive,
      organization_id: 1,
      organization_name: 'DentaVie',
      branch_id: role === 'ORGANIZATION_ADMIN' || role === 'PATIENT' ? null : 1,
      branch_name: role === 'ORGANIZATION_ADMIN' || role === 'PATIENT' ? null : 'Branch 1',
    }],
  }
}

describe('role access', () => {
  it('treats every active staff role as non-patient', () => {
    for (const role of ['DENTIST', 'BRANCH_ADMIN', 'ORGANIZATION_ADMIN'] as const) {
      const user = userWithRole(role)
      expect(isStaffUser(user)).toBe(true)
      expect(canAccessArea(user, 'PATIENT')).toBe(false)
    }
  })

  it('allows a normal account into the patient area', () => {
    expect(canAccessArea(userWithRole('PATIENT'), 'PATIENT')).toBe(true)
    expect(canAccessArea(userWithRole('DENTIST', false), 'PATIENT')).toBe(true)
  })

  it('separates dentist and management areas', () => {
    expect(canAccessArea(userWithRole('DENTIST'), 'DENTIST')).toBe(true)
    expect(canAccessArea(userWithRole('DENTIST'), 'MANAGEMENT')).toBe(false)
    expect(canAccessArea(userWithRole('BRANCH_ADMIN'), 'MANAGEMENT')).toBe(true)
    expect(canAccessArea(userWithRole('BRANCH_ADMIN'), 'DENTIST')).toBe(false)
    expect(canAccessArea(userWithRole('ORGANIZATION_ADMIN'), 'ORGANIZATION')).toBe(true)
    expect(canAccessArea(userWithRole('BRANCH_ADMIN'), 'ORGANIZATION')).toBe(false)
  })

  it('allows every signed-in role into account security', () => {
    for (const role of ['PATIENT', 'DENTIST', 'BRANCH_ADMIN', 'ORGANIZATION_ADMIN'] as const) {
      expect(canAccessArea(userWithRole(role), 'AUTHENTICATED')).toBe(true)
    }
  })

  it('returns branch ids from active memberships only', () => {
    const user = userWithRole('DENTIST')
    user.memberships = [
      { ...user.memberships![0], branch_id: 1, branch_name: 'Branch 1' },
      { ...user.memberships![0], branch_id: 2, branch_name: 'Branch 2', is_active: false },
      { ...user.memberships![0], branch_id: 1, branch_name: 'Branch 1 duplicate' },
    ]

    expect(activeBranchIdsForRole(user, 'DENTIST')).toEqual([1])
  })

  it('returns organization ids from active memberships only', () => {
    const user = userWithRole('ORGANIZATION_ADMIN')
    user.memberships = [
      { ...user.memberships![0], organization_id: 3, organization_name: 'Org 3' },
      { ...user.memberships![0], organization_id: 4, organization_name: 'Org 4', is_active: false },
      { ...user.memberships![0], organization_id: 3, organization_name: 'Org 3 duplicate' },
    ]

    expect(activeOrganizationIdsForRole(user, 'ORGANIZATION_ADMIN')).toEqual([3])
  })
})
