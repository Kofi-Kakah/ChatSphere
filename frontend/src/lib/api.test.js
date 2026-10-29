import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, refreshAccessToken } from './api.js'
import { useAuthStore } from '../store/auth.js'

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  }
}

beforeEach(() => {
  useAuthStore.getState().clear()
})

describe('refreshAccessToken', () => {
  it('shares one in-flight refresh between concurrent callers', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response(200, { user: { _id: 'u1' }, accessToken: 'access-1' }))
    vi.stubGlobal('fetch', fetchMock)

    const [first, second] = await Promise.all([refreshAccessToken(), refreshAccessToken()])

    expect(first).toEqual({ user: { _id: 'u1' }, accessToken: 'access-1' })
    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/refresh')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'include' })
  })

  it('starts a new refresh after the previous one settles', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response(200, { user: { _id: 'u1' }, accessToken: 'access-1' }))
    vi.stubGlobal('fetch', fetchMock)

    await refreshAccessToken()
    await refreshAccessToken()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('api client', () => {
  it('refreshes once on 401, stores the new session, and retries with the new token', async () => {
    useAuthStore.getState().setAuth({ _id: 'u1' }, 'access-1')
    const seen = []
    const fetchMock = vi.fn(async (url, options) => {
      seen.push({ url, authorization: options?.headers?.Authorization })
      if (seen.length === 1) return response(401, { error: { message: 'expired' } })
      if (seen.length === 2) return response(200, { user: { _id: 'u1' }, accessToken: 'access-2' })
      return response(200, { conversations: [] })
    })
    vi.stubGlobal('fetch', fetchMock)

    const data = await api('/conversations')

    expect(data).toEqual({ conversations: [] })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(seen[0].authorization).toBe('Bearer access-1')
    expect(seen[1].url).toContain('/auth/refresh')
    expect(seen[2].authorization).toBe('Bearer access-2')
    expect(useAuthStore.getState().accessToken).toBe('access-2')
  })

  it('clears the session and fails when the refresh is rejected', async () => {
    useAuthStore.getState().setAuth({ _id: 'u1' }, 'expired-token')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(401, { error: { message: 'expired' } }))
      .mockResolvedValueOnce(response(500, { error: { message: 'server' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api('/conversations')).rejects.toThrow('unauthorized')

    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not try to refresh a failed login and surfaces the server message', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response(401, { error: { message: 'Invalid credentials' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api('/auth/login', { method: 'POST', body: '{}' })).rejects.toThrow(
      'Invalid credentials',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns null for 204 responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(204, null))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api('/conversations/c1/typing', { method: 'DELETE' })).resolves.toBeNull()
  })

  it('uses a generic message when an error body is not JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json')
      },
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(api('/conversations')).rejects.toThrow('request failed')
  })
})
