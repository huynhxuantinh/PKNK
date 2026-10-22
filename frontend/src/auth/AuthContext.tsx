import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { apiRequest, getStoredTokens, storeTokens } from '../api/client'
import type { LoginResponse, User } from '../types/api'

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
  login: (email: string, password: string) => Promise<User>
  register: (input: RegisterInput) => Promise<void>
  updateUser: (changes: Partial<Pick<User, 'full_name'>>) => void
  logout: () => void
}

interface RegisterInput {
  fullName: string
  phone: string
  email: string
  password: string
  passwordConfirm: string
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => storedUser())

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiRequest<LoginResponse>('/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    storeTokens(response.data.tokens)
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.data.user))
    setUser(response.data.user)
    return response.data.user
  }, [])

  const register = useCallback(async (input: RegisterInput) => {
    const response = await apiRequest<LoginResponse>('/auth/register/', {
      method: 'POST',
      body: JSON.stringify({
        full_name: input.fullName,
        phone: input.phone,
        email: input.email,
        password: input.password,
        password_confirm: input.passwordConfirm,
        consent_to_data_processing: true,
      }),
    })
    storeTokens(response.data.tokens)
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.data.user))
    setUser(response.data.user)
  }, [])

  const updateUser = useCallback((changes: Partial<Pick<User, 'full_name'>>) => {
    setUser((current) => {
      if (!current) return current
      const next = { ...current, ...changes }
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const logout = useCallback(() => {
    storeTokens(null)
    localStorage.removeItem(USER_STORAGE_KEY)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user && getStoredTokens()),
      login,
      register,
      updateUser,
      logout,
    }),
    [login, logout, register, updateUser, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth phải được dùng bên trong AuthProvider.')
  return context
}
