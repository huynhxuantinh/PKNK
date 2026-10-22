import type { TokenPair } from '../types/api'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const TOKEN_STORAGE_KEY = 'pknk_tokens'

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function getStoredTokens(): TokenPair | null {
  try {
    const value = localStorage.getItem(TOKEN_STORAGE_KEY)
    return value ? (JSON.parse(value) as TokenPair) : null
  } catch {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    return null
  }
}

export function storeTokens(tokens: TokenPair | null) {
  if (tokens) {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens))
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const body = payload as Record<string, unknown>
  if (body.error && typeof body.error === 'object') {
    const message = (body.error as Record<string, unknown>).message
    if (typeof message === 'string') return message
  }
  if (typeof body.detail === 'string') return body.detail
  const fieldError = Object.values(body).find(Array.isArray)
  if (Array.isArray(fieldError) && typeof fieldError[0] === 'string') {
    return fieldError[0]
  }
  return fallback
}

async function refreshAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens()
  if (!tokens?.refresh) return null

  const response = await fetch(`${API_BASE_URL}/auth/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: tokens.refresh }),
  })
  if (!response.ok) {
    storeTokens(null)
    return null
  }
  const payload = (await response.json()) as { data: TokenPair }
  storeTokens(payload.data)
  return payload.data.access
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: { auth?: boolean; retry?: boolean } = {},
): Promise<T> {
  const { auth = false, retry = true } = options
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  if (auth) {
    const access = getStoredTokens()?.access
    if (!access) throw new ApiError('Bạn cần đăng nhập để đặt lịch.', 401)
    headers.set('Authorization', `Bearer ${access}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
  if (response.status === 401 && auth && retry) {
    const access = await refreshAccessToken()
    if (access) return apiRequest<T>(path, init, { auth: true, retry: false })
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new ApiError(
      errorMessage(payload, `Yêu cầu thất bại (${response.status}).`),
      response.status,
    )
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
