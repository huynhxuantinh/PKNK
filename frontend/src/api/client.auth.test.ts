import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiRequest, authenticatedFileBlobUrl, getStoredTokens, storeTokens } from './client'

const storage = new Map<string, string>()

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
})

afterEach(() => {
  storage.clear()
  vi.unstubAllGlobals()
})

describe('apiRequest refresh retry', () => {
  it('lets the browser set the multipart boundary for FormData', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const body = new FormData()
    body.append('file', new Blob(['image']), 'photo.png')

    await apiRequest('/clinical/attachments/', { method: 'POST', body })

    const headers = new Headers(fetchMock.mock.calls[0][1].headers)
    expect(headers.has('Content-Type')).toBe(false)
  })

  it('keeps JSON content type for serialized request bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await apiRequest('/example/', { method: 'POST', body: JSON.stringify({ value: 1 }) })

    const headers = new Headers(fetchMock.mock.calls[0][1].headers)
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('loads protected thumbnails with the access token', async () => {
    storeTokens({ access: 'image-access', refresh: 'image-refresh' })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(['image']), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const blobUrl = await authenticatedFileBlobUrl('/api/v1/clinical/attachments/8/download/')

    const headers = new Headers(fetchMock.mock.calls[0][1].headers)
    expect(headers.get('Authorization')).toBe('Bearer image-access')
    expect(blobUrl).toMatch(/^blob:/)
    URL.revokeObjectURL(blobUrl)
  })

  it('shows a clear message for a forbidden request without an API message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })))

    await expect(apiRequest('/protected/')).rejects.toMatchObject({
      status: 403,
      message: 'Bạn không có quyền sử dụng chức năng này.',
    })
  })

  it('rebuilds a logout request with the rotated refresh token', async () => {
    storeTokens({ access: 'expired-access', refresh: 'old-refresh' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { access: 'new-access', refresh: 'new-refresh' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const logoutRequest = () => ({
      method: 'POST',
      body: JSON.stringify({ refresh: getStoredTokens()?.refresh }),
    })
    await apiRequest<void>('/auth/logout/', logoutRequest(), {
      auth: true,
      retryInit: logoutRequest,
    })

    expect(fetchMock.mock.calls[2][1].body).toBe(JSON.stringify({ refresh: 'new-refresh' }))
  })

  it('keeps tokens when refresh is temporarily unavailable', async () => {
    storeTokens({ access: 'expired-access', refresh: 'still-valid-refresh' })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 })))

    await expect(apiRequest('/patients/me/', {}, { auth: true })).rejects.toMatchObject({ status: 401 })

    expect(getStoredTokens()).toEqual({ access: 'expired-access', refresh: 'still-valid-refresh' })
  })
})
