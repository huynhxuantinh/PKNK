import type { TokenPair } from '../types/api'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const TOKEN_STORAGE_KEY = 'pknk_tokens'
export const AUTH_EXPIRED_EVENT = 'pknk-auth-expired'
let refreshPromise: Promise<string | null> | null = null

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

function notifyAuthExpired() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
}

function errorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const body = payload as Record<string, unknown>
  if (typeof body.message === 'string') return body.message
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

type LockManagerLike = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>
}

function browserLockManager(): LockManagerLike | null {
  if (typeof navigator === 'undefined') return null
  return (navigator as Navigator & { locks?: LockManagerLike }).locks || null
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  const initialRefreshToken = getStoredTokens()?.refresh
  if (!initialRefreshToken) return null

  const refresh = async () => {
    const tokens = getStoredTokens()
    if (!tokens?.refresh) return null
    // A different tab may have refreshed while this tab was waiting for the lock.
    if (tokens.refresh !== initialRefreshToken) return tokens.access

    const response = await fetch(`${API_BASE_URL}/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: tokens.refresh }),
    })
    if (!response.ok) {
      // Only an invalid/revoked refresh token ends the session. Rate limits and
      // server failures are temporary and must not log the user out.
      if (
        (response.status === 400 || response.status === 401)
        && getStoredTokens()?.refresh === tokens.refresh
      ) {
        storeTokens(null)
        notifyAuthExpired()
      }
      return null
    }
    const payload = (await response.json()) as { data: TokenPair }
    storeTokens(payload.data)
    return payload.data.access
  }

  const lockManager = browserLockManager()
  refreshPromise = (lockManager
    ? lockManager.request('pknk-auth-refresh', refresh)
    : refresh()
  ).finally(() => { refreshPromise = null })
  return refreshPromise
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: {
    auth?: boolean
    retry?: boolean
    retryInit?: () => RequestInit
  } = {},
): Promise<T> {
  const { auth = false, retry = true, retryInit } = options
  const headers = new Headers(init.headers)
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData
  if (init.body && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (auth) {
    const access = getStoredTokens()?.access
    if (!access) throw new ApiError('Bạn cần đăng nhập để đặt lịch.', 401)
    headers.set('Authorization', `Bearer ${access}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
  if (response.status === 401 && auth && retry) {
    const access = await refreshAccessToken()
    if (access) {
      return apiRequest<T>(path, retryInit ? retryInit() : init, { auth: true, retry: false })
    }
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const fallback = response.status === 403
      ? 'Bạn không có quyền sử dụng chức năng này.'
      : `Yêu cầu thất bại (${response.status}).`
    throw new ApiError(
      errorMessage(payload, fallback),
      response.status,
    )
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function downloadRequestPath(path: string): string {
  if (/^https?:\/\//.test(path)) {
    const url = new URL(path)
    // Django may build an absolute URL using Docker's internal `web:8000`
    // hostname. Keep only the API path so the browser uses the Vite proxy.
    return `${url.pathname}${url.search}`
  }
  return path.startsWith(API_BASE_URL) ? path : `${API_BASE_URL}${path}`
}

async function fetchAuthenticatedFile(path: string) {
  const downloadUrl = downloadRequestPath(path)
  const request = async () => fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${getStoredTokens()?.access || ''}` },
  })
  let response = await request()
  if (response.status === 401 && await refreshAccessToken()) response = await request()
  if (!response.ok) throw new ApiError(`Không thể tải tệp (${response.status}).`, response.status)
  return response
}

export async function authenticatedFileBlobUrl(path: string) {
  return URL.createObjectURL(await (await fetchAuthenticatedFile(path)).blob())
}

export async function downloadAuthenticatedFile(path: string, filename: string) {
  const blobUrl = await authenticatedFileBlobUrl(path)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(blobUrl)
}
