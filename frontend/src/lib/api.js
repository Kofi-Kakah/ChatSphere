export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'

const BASE = API_BASE

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

export async function apiBlob(path) {
  const { useAuthStore } = await import('./../store/auth.js')
  let token = useAuthStore.getState().accessToken
  const load = () => fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  })

  let res = await load()
  if (res.status === 401) {
    try {
      const data = await refreshAccessToken()
      useAuthStore.getState().setAuth(data.user, data.accessToken)
      token = data.accessToken
      res = await load()
    } catch {
      useAuthStore.getState().clear()
      throw new Error('unauthorized')
    }
  }
  if (!res.ok) throw new Error('media fetch failed')
  return res.blob()
}

export async function uploadFile(file, { onProgress, signal } = {}) {
  const { useAuthStore } = await import('./../store/auth.js')

  const send = (token) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const form = new FormData()
    form.append('file', file)
    xhr.open('POST', `${BASE}/uploads`)
    xhr.withCredentials = true
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      let body = {}
      try { body = JSON.parse(xhr.responseText) } catch { /* non-JSON error body */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body)
      else {
        const error = new Error(body?.error?.message || 'upload failed')
        error.status = xhr.status
        reject(error)
      }
    }
    xhr.onerror = () => reject(new Error('upload failed'))
    xhr.onabort = () => reject(new DOMException('aborted', 'AbortError'))
    if (signal) {
      if (signal.aborted) { xhr.abort(); return }
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }
    xhr.send(form)
  })

  let token = useAuthStore.getState().accessToken
  try {
    return await send(token)
  } catch (error) {
    if (error.status !== 401) throw error
    const data = await refreshAccessToken()
    useAuthStore.getState().setAuth(data.user, data.accessToken)
    token = data.accessToken
    return send(token)
  }
}
