import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuth } from '../auth/AuthContext'
import {
  acceptNewStaffInvitation,
  acceptStaffInvitation,
  previewStaffInvitation,
} from '../api/management'
import { AcceptInvitationPage } from './AcceptInvitationPage'

vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../api/management', () => ({
  acceptStaffInvitation: vi.fn(),
  acceptNewStaffInvitation: vi.fn(),
  previewStaffInvitation: vi.fn(),
}))
vi.mock('../api/client', () => {
  class ApiError extends Error {
    constructor(message: string, public readonly status: number) {
      super(message)
    }
  }
  return { apiRequest: vi.fn(), ApiError }
})
vi.mock('../seo/Seo', () => ({ Seo: () => null }))

const authenticatedUser = {
  id_user: 7,
  email: 'dentist@example.com',
  full_name: 'BS. Demo',
  email_verified: true,
  email_verified_at: '2026-10-26T00:00:00Z',
  memberships: [],
}

const previewBase = {
  email: 'dentist@example.com',
  organization_name: 'DentaVie',
  branch_name: 'An Khánh',
  role: 'BRANCH_ADMIN' as const,
  invited_by_name: 'Quản trị viên',
  expires_at: '2026-10-30T10:00:00Z',
  has_account: true,
}

function LocationProbe({ onChange }: { onChange: (path: string) => void }) {
  const location = useLocation()
  onChange(`${location.pathname}${location.search}`)
  return null
}

describe('AcceptInvitationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(previewStaffInvitation).mockResolvedValue({ data: previewBase })
  })

  it('redirects a guest to sign in while preserving the invitation token', async () => {
    vi.mocked(previewStaffInvitation).mockResolvedValue({
      data: {
        ...previewBase,
        email: 'existing@example.com',
        has_account: true,
      },
    })
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isAuthReady: true,
      updateUser: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    } as ReturnType<typeof useAuth>)
    let currentPath = ''

    await act(async () => {
      create(
        <MemoryRouter initialEntries={['/accept-invitation?token=invite-token']}>
          <Routes>
            <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
            <Route path="*" element={<LocationProbe onChange={(path) => { currentPath = path }} />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    const returnTo = encodeURIComponent('/accept-invitation?token=invite-token')
    expect(currentPath).toBe(`/dang-nhap?returnTo=${returnTo}`)
  })

  it('creates and signs in a new invited staff account in one form', async () => {
    const startSession = vi.fn()
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isAuthReady: true,
      startSession,
      updateUser: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    } as ReturnType<typeof useAuth>)
    vi.mocked(previewStaffInvitation).mockResolvedValue({
      data: {
        ...previewBase,
        email: 'new.staff@example.com',
        has_account: false,
      },
    })
    const createdUser = {
      ...authenticatedUser,
      email: 'new.staff@example.com',
      memberships: [{
        role: 'BRANCH_ADMIN' as const,
        is_active: true,
        organization_id: 1,
        organization_name: 'DentaVie',
        branch_id: 2,
        branch_name: 'An Khánh',
      }],
    }
    const tokens = { access: 'access-token', refresh: 'refresh-token' }
    vi.mocked(acceptNewStaffInvitation).mockResolvedValue({
      data: {
        user: createdUser,
        tokens,
        membership: {
          id_membership: 9,
          user_id: 7,
          organization_id: 1,
          branch_id: 2,
          role: 'BRANCH_ADMIN',
          is_active: true,
        },
      },
    })
    let renderer: ReactTestRenderer
    let currentPath = ''

    await act(async () => {
      renderer = create(
        <MemoryRouter initialEntries={['/accept-invitation?token=invite-token']}>
          <Routes>
            <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
            <Route path="*" element={<LocationProbe onChange={(path) => { currentPath = path }} />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    const inputs = renderer!.root.findAllByType('input')
    await act(async () => {
      inputs[0].props.onChange({ target: { value: 'Nguyễn Quản Lý' } })
      inputs[1].props.onChange({ target: { value: '0901234567' } })
      inputs[2].props.onChange({ target: { value: 'NewStaff!2026' } })
      inputs[3].props.onChange({ target: { value: 'NewStaff!2026' } })
    })
    await act(async () => {
      await renderer!.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() })
    })

    expect(acceptNewStaffInvitation).toHaveBeenCalledWith({
      token: 'invite-token',
      full_name: 'Nguyễn Quản Lý',
      phone: '0901234567',
      password: 'NewStaff!2026',
    })
    expect(startSession).toHaveBeenCalledWith(createdUser, tokens)
    expect(currentPath).toBe('/quan-ly-chi-nhanh')
  })

  it('shows an accessible error when the token is missing', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isAuthReady: true,
      updateUser: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    } as ReturnType<typeof useAuth>)
    let renderer: ReactTestRenderer

    await act(async () => {
      renderer = create(
        <MemoryRouter initialEntries={['/accept-invitation']}>
          <AcceptInvitationPage />
        </MemoryRouter>,
      )
    })

    expect(renderer!.root.findByProps({ role: 'alert' }).children.join('')).toContain(
      'Liên kết lời mời không hợp lệ',
    )
  })

  it('explains an email mismatch and lets the user sign out', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    vi.mocked(previewStaffInvitation).mockResolvedValue({
      data: { ...previewBase, email: 'invitee@example.com' },
    })
    vi.mocked(useAuth).mockReturnValue({
      user: { ...authenticatedUser, email: 'other@example.com' },
      isAuthenticated: true,
      isAuthReady: true,
      updateUser: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout,
    } as ReturnType<typeof useAuth>)
    let renderer: ReactTestRenderer
    let currentPath = ''

    await act(async () => {
      renderer = create(
        <MemoryRouter initialEntries={['/accept-invitation?token=invite-token']}>
          <Routes>
            <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
            <Route path="*" element={<LocationProbe onChange={(path) => { currentPath = path }} />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    const alert = renderer!.root.findByProps({ role: 'alert' }).children.join('')
    expect(alert).toContain('i***@example.com')
    expect(alert).not.toContain('invitee@example.com')
    expect(acceptStaffInvitation).not.toHaveBeenCalled()

    await act(async () => {
      await renderer!.root.findByProps({ type: 'button' }).props.onClick()
    })

    expect(logout).toHaveBeenCalledTimes(1)
    expect(currentPath).toBe(
      `/dang-nhap?returnTo=${encodeURIComponent('/accept-invitation?token=invite-token')}`,
    )
  })

  it('accepts the invitation only on explicit confirmation', async () => {
    const updateUser = vi.fn()
    vi.mocked(useAuth).mockReturnValue({
      user: authenticatedUser,
      isAuthenticated: true,
      isAuthReady: true,
      updateUser,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    } as ReturnType<typeof useAuth>)
    vi.mocked(acceptStaffInvitation).mockResolvedValue({
      data: {
        id_membership: 8,
        user_id: 7,
        organization_id: 1,
        branch_id: 2,
        role: 'DENTIST',
        is_active: true,
      },
    })
    const refreshedUser = {
      ...authenticatedUser,
      memberships: [{
        role: 'DENTIST' as const,
        is_active: true,
        organization_id: 1,
        organization_name: 'DentaVie',
        branch_id: 2,
        branch_name: 'An Khánh',
      }],
    }
    const { apiRequest } = await import('../api/client')
    vi.mocked(apiRequest).mockResolvedValue({ data: refreshedUser })
    let renderer: ReactTestRenderer
    let currentPath = ''

    await act(async () => {
      renderer = create(
        <MemoryRouter initialEntries={['/accept-invitation?token=invite-token']}>
          <Routes>
            <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
            <Route path="*" element={<LocationProbe onChange={(path) => { currentPath = path }} />} />
          </Routes>
        </MemoryRouter>,
      )
    })
    expect(acceptStaffInvitation).not.toHaveBeenCalled()
    const pageText = JSON.stringify(renderer!.toJSON())
    expect(pageText).toContain('DentaVie')
    expect(pageText).toContain('Quản lý chi nhánh')
    expect(pageText).toContain('An Khánh')
    expect(pageText).toContain('Quản trị viên')

    const button = renderer!.root.findByProps({ type: 'button' })
    await act(async () => {
      await Promise.all([button.props.onClick(), button.props.onClick()])
    })

    expect(acceptStaffInvitation).toHaveBeenCalledTimes(1)
    expect(acceptStaffInvitation).toHaveBeenCalledWith('invite-token')
    expect(apiRequest).toHaveBeenCalledWith('/auth/me/', {}, { auth: true })
    expect(updateUser).toHaveBeenCalledWith(refreshedUser)
    expect(currentPath).toBe('/bac-si/chon-chi-nhanh')
  })

  it('explains an invalid, used or expired invitation', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: authenticatedUser,
      isAuthenticated: true,
      isAuthReady: true,
      updateUser: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    } as ReturnType<typeof useAuth>)
    const { ApiError } = await import('../api/client')
    vi.mocked(acceptStaffInvitation).mockRejectedValue(new ApiError('Token invalid', 400))
    let renderer: ReactTestRenderer

    await act(async () => {
      renderer = create(
        <MemoryRouter initialEntries={['/accept-invitation?token=used-token']}>
          <AcceptInvitationPage />
        </MemoryRouter>,
      )
    })
    await act(async () => {
      await renderer!.root.findByProps({ type: 'button' }).props.onClick()
    })

    expect(renderer!.root.findByProps({ role: 'alert' }).children.join('')).toContain(
      'đã dùng hoặc đã hết hạn',
    )
  })

  it('surfaces the backend conflict message', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: authenticatedUser,
      isAuthenticated: true,
      isAuthReady: true,
      updateUser: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    } as ReturnType<typeof useAuth>)
    const { ApiError } = await import('../api/client')
    vi.mocked(acceptStaffInvitation).mockRejectedValue(
      new ApiError('Người dùng còn lịch hẹn bệnh nhân đang hoạt động.', 409),
    )
    let renderer: ReactTestRenderer

    await act(async () => {
      renderer = create(
        <MemoryRouter initialEntries={['/accept-invitation?token=invite-token']}>
          <AcceptInvitationPage />
        </MemoryRouter>,
      )
    })
    await act(async () => {
      await renderer!.root.findByProps({ type: 'button' }).props.onClick()
    })

    expect(renderer!.root.findByProps({ role: 'alert' }).children.join('')).toContain(
      'Người dùng còn lịch hẹn bệnh nhân đang hoạt động.',
    )
  })

  it('offers the verification link when the backend requires a verified email', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: authenticatedUser,
      isAuthenticated: true,
      isAuthReady: true,
      updateUser: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    } as ReturnType<typeof useAuth>)
    const { ApiError } = await import('../api/client')
    vi.mocked(acceptStaffInvitation).mockRejectedValue(new ApiError('Verify email first', 403))
    let renderer: ReactTestRenderer

    await act(async () => {
      renderer = create(
        <MemoryRouter initialEntries={['/accept-invitation?token=invite-token']}>
          <AcceptInvitationPage />
        </MemoryRouter>,
      )
    })
    await act(async () => {
      await renderer!.root.findByProps({ type: 'button' }).props.onClick()
    })

    expect(renderer!.root.findByProps({ role: 'alert' }).children.join('')).toContain(
      'cần xác minh email',
    )
    expect(JSON.stringify(renderer!.toJSON())).toContain('Đi tới xác minh email')
  })
})
