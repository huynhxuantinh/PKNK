import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createOrganizationMembership,
  listOrganizationInvitations,
  listOrganizationMemberships,
  revokeOrganizationInvitation,
} from '../../api/organization'
import { OrganizationAdminPanel } from './OrganizationAdminPanel'

vi.mock('../../api/organization', () => ({
  listOrganizationMemberships: vi.fn(),
  listOrganizationInvitations: vi.fn(),
  createOrganizationMembership: vi.fn(),
  updateOrganizationMembership: vi.fn(),
  revokeOrganizationInvitation: vi.fn(),
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
    vi.mocked(listOrganizationInvitations).mockResolvedValue({
      data: [],
    } as Awaited<ReturnType<typeof listOrganizationInvitations>>)
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
    expect(markup).toContain('organization-staff-table-wrap')
    expect(markup).toContain('organization-admin-table')
    expect(markup).toContain('Danh sách quản trị viên')
  })

  it('shows one manager row per branch with invite or change actions', async () => {
    const twoBranches = [
      branches[0],
      {
        ...branches[0],
        id_branch: 3,
        code: 'CG',
        name: 'Cầu Giấy',
      },
    ]
    vi.mocked(listOrganizationMemberships).mockResolvedValue({
      data: [
        membership(1, 'ORGANIZATION_ADMIN', 'owner@example.com'),
        membership(2, 'BRANCH_ADMIN', 'branch@example.com', 2),
      ],
    } as Awaited<ReturnType<typeof listOrganizationMemberships>>)

    let renderer: ReactTestRenderer
    await act(async () => {
      renderer = create(
        <OrganizationAdminPanel
          organizationId={1}
          branches={twoBranches}
          currentUserId={1}
        />,
      )
    })
    await act(async () => undefined)

    const markup = JSON.stringify(renderer!.toJSON())
    expect(markup).toContain('branch@example.com')
    expect(markup).toContain('Đổi người')
    expect(markup).toContain('Chưa có quản lý')
    expect(markup).toContain('Mời')
    expect(markup).toContain('Cầu Giấy')
  })

  it('warns by branch coverage instead of comparing manager counts', async () => {
    const twoBranches = [
      branches[0],
      {
        ...branches[0],
        id_branch: 3,
        code: 'CG',
        name: 'Cầu Giấy',
      },
    ]
    vi.mocked(listOrganizationMemberships).mockResolvedValue({
      data: [
        membership(2, 'BRANCH_ADMIN', 'first@example.com', 2),
        membership(3, 'BRANCH_ADMIN', 'second@example.com', 2),
      ],
    } as Awaited<ReturnType<typeof listOrganizationMemberships>>)

    let renderer: ReactTestRenderer
    await act(async () => {
      renderer = create(
        <OrganizationAdminPanel
          organizationId={1}
          branches={twoBranches}
          currentUserId={1}
        />,
      )
    })
    await act(async () => undefined)

    const markup = JSON.stringify(renderer!.toJSON())
    expect(markup).toMatch(/"children":\["1"," chi nhánh chưa có quản lý:"/)
    expect(markup).toContain('"Cầu Giấy"')
    expect(markup).not.toMatch(/"children":\["2"," chi nhánh chưa có quản lý:"/)
  })

  it('lists pending invitations with their role and branch', async () => {
    vi.mocked(listOrganizationMemberships).mockResolvedValue({
      data: [membership(1, 'ORGANIZATION_ADMIN', 'owner@example.com')],
    } as Awaited<ReturnType<typeof listOrganizationMemberships>>)
    vi.mocked(listOrganizationInvitations).mockResolvedValue({
      data: [{
        id_staff_invitation: 9,
        email: 'pending@example.com',
        role: 'BRANCH_ADMIN',
        branch_id: 2,
        branch_name: 'Mỹ Đình',
        status: 'PENDING',
        email_delivery_status: 'SENT',
        email_sent_at: '2026-10-26T00:01:00Z',
        email_failed_at: null,
        expires_at: '2026-11-02T00:00:00Z',
        created_at: '2026-10-26T00:00:00Z',
        invited_by_email: 'owner@example.com',
      }],
    } as Awaited<ReturnType<typeof listOrganizationInvitations>>)

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
    expect(markup).toContain('Lời mời chưa được chấp nhận')
    expect(markup).toContain('pending@example.com')
    expect(markup).toContain('Mỹ Đình')
    expect(markup).toContain('Đã gửi')
    expect(markup).toContain('Thu hồi')
  })

  it('revokes a pending invitation after confirmation', async () => {
    vi.mocked(listOrganizationMemberships).mockResolvedValue({
      data: [membership(1, 'ORGANIZATION_ADMIN', 'owner@example.com')],
    } as Awaited<ReturnType<typeof listOrganizationMemberships>>)
    vi.mocked(listOrganizationInvitations).mockResolvedValue({
      data: [{
        id_staff_invitation: 9,
        email: 'pending@example.com',
        role: 'BRANCH_ADMIN',
        branch_id: 2,
        branch_name: 'Mỹ Đình',
        status: 'PENDING',
        email_delivery_status: 'SENT',
        email_sent_at: '2026-10-26T00:01:00Z',
        email_failed_at: null,
        expires_at: '2026-11-02T00:00:00Z',
        created_at: '2026-10-26T00:00:00Z',
        invited_by_email: 'owner@example.com',
      }],
    } as Awaited<ReturnType<typeof listOrganizationInvitations>>)
    vi.mocked(revokeOrganizationInvitation).mockResolvedValue(undefined as never)

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

    const revokeButton = renderer!.root.findAllByType('button').find(
      (button) => JSON.stringify(button.children).includes('Thu hồi'),
    )
    await act(async () => {
      revokeButton!.props.onClick()
    })

    const confirmButton = renderer!.root.findAllByType('button').find(
      (button) => JSON.stringify(button.children).includes('Thu hồi lời mời'),
    )
    await act(async () => {
      await confirmButton!.props.onClick()
    })

    expect(revokeOrganizationInvitation).toHaveBeenCalledWith(9)
  })

  it('shows an expired invitation and sends it again', async () => {
    vi.mocked(listOrganizationMemberships).mockResolvedValue({
      data: [membership(1, 'ORGANIZATION_ADMIN', 'owner@example.com')],
    } as Awaited<ReturnType<typeof listOrganizationMemberships>>)
    vi.mocked(listOrganizationInvitations).mockResolvedValue({
      data: [{
        id_staff_invitation: 10,
        email: 'expired@example.com',
        role: 'BRANCH_ADMIN',
        branch_id: 2,
        branch_name: 'Mỹ Đình',
        status: 'EXPIRED',
        email_delivery_status: 'FAILED',
        email_sent_at: null,
        email_failed_at: '2026-09-28T00:05:00Z',
        expires_at: '2026-10-01T00:00:00Z',
        created_at: '2026-09-28T00:00:00Z',
        invited_by_email: 'owner@example.com',
      }],
    } as Awaited<ReturnType<typeof listOrganizationInvitations>>)
    vi.mocked(createOrganizationMembership).mockResolvedValue({
      data: { invitation_id: 11, status: 'PENDING' },
    })

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
    expect(markup).toContain('Đã hết hạn')
    expect(markup).toContain('Gửi lỗi')
    expect(markup).toContain('Gửi lại')
    expect(markup).toContain('Ẩn')

    const resendButton = renderer!.root.findAllByType('button').find(
      (button) => JSON.stringify(button.children).includes('Gửi lại'),
    )
    await act(async () => {
      await resendButton!.props.onClick()
    })

    expect(createOrganizationMembership).toHaveBeenCalledWith(1, {
      email: 'expired@example.com',
      role: 'BRANCH_ADMIN',
      branch_id: 2,
    })
  })
})
