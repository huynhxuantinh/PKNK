import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { AUTH_EXPIRED_EVENT, apiRequest, getStoredTokens, storeTokens } from '../api/client'
import { clearClinicalDraftCaches } from '../features/dentist/clinicalDraft'
import { clearBookingHoldCaches } from '../features/booking/bookingState'
import type { LoginResponse, TokenPair, User } from '../types/api'

const USER_STORAGE_KEY = 'pknk_user'

function storedUser(): User | null {
  try {
    const value = localStorage.getItem(USER_STORAGE_KEY)
    return value ? (JSON.parse(value) as User) : null
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY)
    return null
  }
}

interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  isAuthReady: boolean
  login: (email: string, password: string) => Promise<User>
  register: (input: RegisterInput) => Promise<void>
  startSession?: (user: User, tokens: TokenPair) => void
  updateUser: (changes: Partial<User>) => void
  logout: () => Promise<void>
}

interface RegisterInput {
  fullName: string
  phone: string
  email: string
  returnTo?: string
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => storedUser())
  const [isAuthReady, setIsAuthReady] = useState(false)

  const persistUser = useCallback((next: User | null) => {
    if (next) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(next))
    else localStorage.removeItem(USER_STORAGE_KEY)
    setUser(next)
  }, [])

  const synchronizeUser = useCallback(async () => {
    if (!getStoredTokens()) return
    try {
      const response = await apiRequest<{ data: User }>('/auth/me/', {}, { auth: true })
      persistUser(response.data)
    } catch {
      if (!getStoredTokens()) persistUser(null)
    }
  }, [persistUser])

  useEffect(() => {
    let active = true
    void synchronizeUser().finally(() => {
      if (active) setIsAuthReady(true)
    })
    const onFocus = () => { void synchronizeUser() }
    const clearExpiredSession = () => {
      clearClinicalDraftCaches()
      clearBookingHoldCaches()
      persistUser(null)
    }
    const syncAcrossTabs = (event: StorageEvent) => {
      if (event.key === 'pknk_tokens' && !event.newValue) clearExpiredSession()
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener(AUTH_EXPIRED_EVENT, clearExpiredSession)
    window.addEventListener('storage', syncAcrossTabs)
    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
      window.removeEventListener(AUTH_EXPIRED_EVENT, clearExpiredSession)
      window.removeEventListener('storage', syncAcrossTabs)
    }
  }, [persistUser, synchronizeUser])

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiRequest<LoginResponse>('/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    storeTokens(response.data.tokens)
    persistUser(response.data.user)
    return response.data.user
  }, [persistUser])

  const register = useCallback(async (input: RegisterInput) => {
    await apiRequest<{ data: { message: string } }>('/auth/register/', {
      method: 'POST',
      body: JSON.stringify({
        full_name: input.fullName,
        phone: input.phone,
        email: input.email,
        return_to: input.returnTo || '',
        consent_to_data_processing: true,
      }),
    })
  }, [])

  const updateUser = useCallback((changes: Partial<User>) => {
    setUser((current) => {
      if (!current) return current
      const next = { ...current, ...changes }
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const startSession = useCallback((nextUser: User, tokens: TokenPair) => {
    storeTokens(tokens)
    persistUser(nextUser)
  }, [persistUser])

  const logout = useCallback(async () => {
    const logoutRequest = (): RequestInit | null => {
      const refresh = getStoredTokens()?.refresh
      return refresh
        ? { method: 'POST', body: JSON.stringify({ refresh }) }
        : null
    }
    try {
      const initialRequest = logoutRequest()
      if (initialRequest) {
        await apiRequest<void>(
          '/auth/logout/',
          initialRequest,
          { auth: true, retryInit: () => logoutRequest() || initialRequest },
        )
      }
    } catch {
      // Local logout must still succeed if the user is offline or the token already expired.
    } finally {
      clearClinicalDraftCaches()
      clearBookingHoldCaches()
      storeTokens(null)
      localStorage.removeItem(USER_STORAGE_KEY)
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user && getStoredTokens()),
      isAuthReady,
      login,
      register,
      startSession,
      updateUser,
      logout,
    }),
    [isAuthReady, login, logout, register, startSession, updateUser, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth phải được dùng bên trong AuthProvider.')
  return context
}
