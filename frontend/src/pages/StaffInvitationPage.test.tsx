import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { MemoryRouter } from 'react-router-dom'
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

describe('StaffInvitationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('preserves the invitation link when asking a guest to sign in or register', async () => {
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
        <MemoryRouter initialEntries={['/accept-invitation?token=invite-token']}>
          <StaffInvitationPage />
        </MemoryRouter>,
      )
    })

    const links = renderer!.root.findAllByType('a').map((link) => link.props.href)
    const returnTo = encodeURIComponent('/accept-invitation?token=invite-token')
    expect(links).toContain(`/dang-nhap?returnTo=${returnTo}`)
    expect(links).toContain(`/dang-ky?returnTo=${returnTo}`)
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

    await act(async () => {
      renderer = create(
        <MemoryRouter initialEntries={['/accept-invitation?token=invite-token']}>
          <StaffInvitationPage />
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
    expect(renderer!.root.findByProps({ className: 'invitation-success' })).toBeTruthy()
  })
})
