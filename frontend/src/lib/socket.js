import { io } from 'socket.io-client'
import { useAuthStore } from '../store/auth.js'

let socket = null
let statusListeners = []

export function onStatus(fn) { statusListeners.push(fn); return () => { statusListeners = statusListeners.filter((x) => x !== fn) } }
function setStatus(s) { statusListeners.forEach((fn) => fn(s)) }

export function connectSocket() {
  const token = useAuthStore.getState().accessToken
  if (!token) return
  if (socket) socket.disconnect()
  socket = io(import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:3001', {
    path: '/socket.io',
    auth: { token },
    withCredentials: true,
  })
  window.__socket = socket
  socket.on('connect', () => setStatus('connected'))
  socket.on('disconnect', () => setStatus('disconnected'))
  socket.on('connect_error', () => setStatus('disconnected'))
  socket.on('presence:snapshot', (m) => window.dispatchEvent(new CustomEvent('presence', { detail: m })))
  socket.on('presence:update', (m) => window.dispatchEvent(new CustomEvent('presence', { detail: m })))
  socket.on('message:new', (m) => window.dispatchEvent(new CustomEvent('ws-message', { detail: { type: 'message:new', ...m } })))
  socket.on('typing:update', (m) => window.dispatchEvent(new CustomEvent('ws-message', { detail: { type: 'typing:update', ...m } })))
  socket.on('message:status', (m) => window.dispatchEvent(new CustomEvent('ws-message', { detail: { type: 'message:status', ...m } })))
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; window.__socket = null }
}

export function isSocketOpen() {
  return !!socket && socket.connected
}
