import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuth } from '../auth/AuthContext'
import { acceptStaffInvitation } from '../api/management'
import { StaffInvitationPage } from './StaffInvitationPage'

vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../api/management', () => ({ acceptStaffInvitation: vi.fn() }))
vi.mock('../api/client', () => ({ apiRequest: vi.fn() }))
vi.mock('../seo/Seo', () => ({ Seo: () => null }))

const authenticatedUser = {
  id_user: 7,
  email: 'dentist@example.com',
  full_name: 'BS. Demo',
  email_verified: true,
  email_verified_at: '2026-10-26T00:00:00Z',
  memberships: [],
}

function LocationProbe({ onChange }: { onChange: (path: string) => void }) {
  const location = useLocation()
  onChange(`${location.pathname}${location.search}`)
  return null
}

describe('StaffInvitationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects a guest to sign in while preserving the invitation token', async () => {
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
            <Route path="/accept-invitation" element={<StaffInvitationPage />} />
            <Route path="*" element={<LocationProbe onChange={(path) => { currentPath = path }} />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    const returnTo = encodeURIComponent('/accept-invitation?token=invite-token')
    expect(currentPath).toBe(`/dang-nhap?returnTo=${returnTo}`)
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
          <StaffInvitationPage />
        </MemoryRouter>,
      )
    })

    expect(renderer!.root.findByProps({ role: 'alert' }).children.join('')).toContain(
      'Liên kết lời mời không hợp lệ',
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
            <Route path="/accept-invitation" element={<StaffInvitationPage />} />
            <Route path="*" element={<LocationProbe onChange={(path) => { currentPath = path }} />} />
          </Routes>
        </MemoryRouter>,
      )
    })
    expect(acceptStaffInvitation).not.toHaveBeenCalled()

    const button = renderer!.root.findByProps({ type: 'button' })
    await act(async () => {
      await button.props.onClick()
    })

    expect(acceptStaffInvitation).toHaveBeenCalledWith('invite-token')
    expect(apiRequest).toHaveBeenCalledWith('/auth/me/', {}, { auth: true })
    expect(updateUser).toHaveBeenCalledWith(refreshedUser)
    expect(currentPath).toBe('/bac-si/chon-chi-nhanh')
  })
})
