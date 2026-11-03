import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiRequest, getStoredTokens } from '../api/client'
import { AuthProvider, useAuth } from './AuthContext'

vi.mock('../api/client', () => ({
  AUTH_EXPIRED_EVENT: 'pknk-auth-expired',
  apiRequest: vi.fn(),
  getStoredTokens: vi.fn(),
  storeTokens: vi.fn(),
}))
vi.mock('../features/dentist/clinicalDraft', () => ({ clearClinicalDraftCaches: vi.fn() }))
vi.mock('../features/booking/bookingState', () => ({ clearBookingHoldCaches: vi.fn() }))

const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
})
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setInterval,
    clearInterval,
  },
})
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const userA = {
  id_user: 1,
  email: 'a@example.test',
  full_name: 'Tài khoản A',
  email_verified_at: null,
  email_verified: true,
}
const userB = { ...userA, id_user: 2, email: 'b@example.test', full_name: 'Tài khoản B' }
const tokens = { access: 'access-token', refresh: 'refresh-token' }

let currentAuth: ReturnType<typeof useAuth>

function AuthProbe() {
  currentAuth = useAuth()
  return null
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

describe('AuthProvider session synchronization', () => {
  let renderer: ReactTestRenderer

  beforeEach(() => {
    vi.clearAllMocks()
    storage.clear()
    vi.mocked(getStoredTokens).mockReturnValue(tokens)
  })

  afterEach(() => {
    renderer?.unmount()
  })

  it('ignores a delayed profile response after logout', async () => {
    const pendingProfile = deferred<{ data: typeof userA }>()
    vi.mocked(apiRequest).mockImplementation((path) => {
      if (path === '/auth/me/') return pendingProfile.promise
      return Promise.resolve(undefined)
    })

    await act(async () => {
      renderer = create(<AuthProvider><AuthProbe /></AuthProvider>)
    })
    await act(async () => { await currentAuth.logout() })
    pendingProfile.resolve({ data: userA })
    await act(async () => { await Promise.resolve() })

    expect(currentAuth.user).toBeNull()
  })

  it('ignores a delayed profile response after another session starts', async () => {
    const pendingProfile = deferred<{ data: typeof userA }>()
    vi.mocked(apiRequest).mockReturnValue(pendingProfile.promise)

    await act(async () => {
      renderer = create(<AuthProvider><AuthProbe /></AuthProvider>)
    })
    act(() => { currentAuth.startSession?.(userB, tokens) })
    pendingProfile.resolve({ data: userA })
    await act(async () => { await Promise.resolve() })

    expect(currentAuth.user).toMatchObject({ id_user: userB.id_user })
  })

  it('does not replace the active user with another account update', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ data: userA })

    await act(async () => {
      renderer = create(<AuthProvider><AuthProbe /></AuthProvider>)
    })
    act(() => { currentAuth.startSession?.(userA, tokens) })
    act(() => { currentAuth.updateUser(userB) })

    expect(currentAuth.user).toMatchObject({ id_user: userA.id_user })
  })
})
