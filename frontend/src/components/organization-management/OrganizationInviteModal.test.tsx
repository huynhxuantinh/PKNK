import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { OrganizationInviteModal } from './OrganizationInviteModal'
import type { OrganizationBranch } from '../../api/organization'

const branches = [
  {
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
  },
  {
    id_branch: 3,
    organization_id: 1,
    code: 'CG',
    name: 'Cầu Giấy',
    phone: null,
    email: null,
    province_code: '01',
    ward_code: '00002',
    address_line: 'Số 2',
    location: null,
    is_active: true,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  },
] as OrganizationBranch[]

function renderModal(role: 'ORGANIZATION_ADMIN' | 'BRANCH_ADMIN') {
  return renderToStaticMarkup(
    <OrganizationInviteModal
      form={{ email: '', role, branchId: '' }}
      branches={branches}
      occupiedBranchIds={[3]}
      busy={false}
      error=""
      requiresBranch={role === 'BRANCH_ADMIN'}
      onChange={() => undefined}
      onClose={() => undefined}
      onSubmit={() => undefined}
    />,
  )
}

describe('OrganizationInviteModal', () => {
  it('asks for a branch only when inviting a branch administrator', () => {
    const branchAdmin = renderModal('BRANCH_ADMIN')
    expect(branchAdmin).toContain('Chi nhánh')
    expect(branchAdmin).toContain('Mỹ Đình')
    expect(branchAdmin).toContain('Cầu Giấy (đã có quản lý)')
    expect(branchAdmin).toContain('value="3" disabled=""')

    const organizationAdmin = renderModal('ORGANIZATION_ADMIN')
    expect(organizationAdmin).not.toContain('Mỹ Đình')
  })
})
