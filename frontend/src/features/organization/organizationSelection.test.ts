import { describe, expect, it } from 'vitest'

import {
  organizationOptionsForUser,
  organizationRoleLabel,
  resolveOrganizationId,
} from './organizationSelection'
import type { User } from '../../types/api'

describe('resolveOrganizationId', () => {
  const allowed = [3, 7]

  it('keeps an organization that belongs to the administrator', () => {
    expect(resolveOrganizationId(7, allowed)).toBe(7)
  })

  it('falls back to the first organization for missing or unauthorized ids', () => {
    expect(resolveOrganizationId(null, allowed)).toBe(3)
    expect(resolveOrganizationId(999, allowed)).toBe(3)
  })

  it('returns null when the administrator has no organization', () => {
    expect(resolveOrganizationId(3, [])).toBeNull()
  })
})

describe('organizationOptionsForUser', () => {
  it('keeps only active organization-admin memberships and removes duplicates', () => {
    const user = {
      memberships: [
        {
          role: 'ORGANIZATION_ADMIN',
          is_active: true,
          organization_id: 3,
          organization_name: 'DentaVie',
          branch_id: null,
          branch_name: null,
        },
        {
          role: 'ORGANIZATION_ADMIN',
          is_active: true,
          organization_id: 3,
          organization_name: 'DentaVie',
          branch_id: null,
          branch_name: null,
        },
        {
          role: 'ORGANIZATION_ADMIN',
          is_active: false,
          organization_id: 4,
          organization_name: 'Đã ngưng',
          branch_id: null,
          branch_name: null,
        },
        {
          role: 'BRANCH_ADMIN',
          is_active: true,
          organization_id: 5,
          organization_name: 'Chi nhánh',
          branch_id: 7,
          branch_name: 'An Khánh',
        },
      ],
    } as User

    expect(organizationOptionsForUser(user)).toEqual([
      { id: 3, name: 'DentaVie' },
    ])
    expect(organizationOptionsForUser({
      ...user,
      memberships: [{
        role: 'ORGANIZATION_ADMIN',
        is_active: true,
        organization_id: 8,
        organization_name: null,
        branch_id: null,
        branch_name: null,
      }],
    } as unknown as User)).toEqual([{ id: 8, name: 'Tổ chức #8' }])
    expect(organizationOptionsForUser(null)).toEqual([])
  })
})

describe('organizationRoleLabel', () => {
  it('labels every membership role', () => {
    expect(organizationRoleLabel('ORGANIZATION_ADMIN')).toBe('Quản trị tổ chức')
    expect(organizationRoleLabel('BRANCH_ADMIN')).toBe('Quản lý chi nhánh')
    expect(organizationRoleLabel('DENTIST')).toBe('Nha sĩ')
    expect(organizationRoleLabel('PATIENT')).toBe('Bệnh nhân')
  })
})
