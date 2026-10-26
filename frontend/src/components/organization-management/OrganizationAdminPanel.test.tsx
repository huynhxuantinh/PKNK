import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listOrganizationMemberships } from '../../api/organization'
import { OrganizationAdminPanel } from './OrganizationAdminPanel'

vi.mock('../../api/organization', () => ({
  listOrganizationMemberships: vi.fn(),
  createOrganizationMembership: vi.fn(),
  updateOrganizationMembership: vi.fn(),
}))

const branches = [{
  id_branch: 2,
  organization_id: 1,
  code: 'MD',
  name: 'Mỹ Đình',
  phone: null,
  email: null,
  province_code: '01',
  ward_code: '00001',
  address_line: 'Số 1',
  location: null,
  is_active: true,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
}]

function membership(
  id: number,
  role: 'ORGANIZATION_ADMIN' | 'BRANCH_ADMIN' | 'DENTIST' | 'PATIENT',
  email: string,
  branchId: number | null = null,
) {
  return {
    id_membership: id,
    user_id: id,
    user_email: email,
    user_full_name: email.split('@')[0],
    organization_id: 1,
    branch_id: branchId,
    role,
    is_active: true,
    created_at: '2026-10-01T00:00:00Z',
  }
}

describe('OrganizationAdminPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('only displays organization and branch administrators', async () => {
    vi.mocked(listOrganizationMemberships).mockResolvedValue({
      data: [
        membership(1, 'ORGANIZATION_ADMIN', 'owner@example.com'),
        membership(2, 'BRANCH_ADMIN', 'branch@example.com', 2),
        membership(3, 'DENTIST', 'dentist@example.com', 2),
        membership(4, 'PATIENT', 'patient@example.com'),
      ],
    } as Awaited<ReturnType<typeof listOrganizationMemberships>>)

    let renderer: ReactTestRenderer
    await act(async () => {
      renderer = create(
        <OrganizationAdminPanel
          organizationId={1}
          branches={branches}
          currentUserId={1}
        />,
      )
    })
    await act(async () => undefined)

    const markup = JSON.stringify(renderer!.toJSON())
    expect(markup).toContain('owner@example.com')
    expect(markup).toContain('branch@example.com')
    expect(markup).not.toContain('dentist@example.com')
    expect(markup).not.toContain('patient@example.com')
  })
})
