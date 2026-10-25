const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'

let refreshPromise = null

async function doRefresh() {
  const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
  if (!res.ok) throw new Error('refresh failed')
  return res.json()
}

export async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

export async function api(path, options = {}) {
  const { useAuthStore } = await import('./../store/auth.js')
  const token = useAuthStore.getState().accessToken
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`

  let res = await fetch(`${BASE}${path}`, { ...options, headers, credentials: 'include' })
  if (res.status === 401 && path !== '/auth/refresh' && path !== '/auth/login' && path !== '/auth/register') {
    try {
      const data = await refreshAccessToken()
      useAuthStore.getState().setAuth(data.user, data.accessToken)
      headers.Authorization = `Bearer ${data.accessToken}`
      res = await fetch(`${BASE}${path}`, { ...options, headers, credentials: 'include' })
    } catch {
      useAuthStore.getState().clear()
      throw new Error('unauthorized')
    }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || 'request failed')
  }
  if (res.status === 204) return null
  return res.json()
}
