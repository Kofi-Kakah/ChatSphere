import { useAuthStore } from '../store/auth.js'

let ws = null
let reconnectTimer = null
let reconnectAttempts = 0
let statusListeners = []

export function onStatus(fn) { statusListeners.push(fn); return () => { statusListeners = statusListeners.filter((x) => x !== fn) } }
function setStatus(s) { statusListeners.forEach((fn) => fn(s)) }

export function connectSocket() {
  const token = useAuthStore.getState().accessToken
  if (!token) return
  const url = (import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws')
  ws = new WebSocket(url)
  window.__ws = ws
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'auth', token }))
    reconnectAttempts = 0
    setStatus('connected')
  }
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data)
      if (msg.type === 'presence:snapshot' || msg.type === 'presence:update') {
        window.dispatchEvent(new CustomEvent('presence', { detail: msg }))
      }
      if (msg.type === 'message:new' || msg.type === 'ack') {
        window.dispatchEvent(new CustomEvent('ws-message', { detail: msg }))
      }
    } catch {}
  }
  ws.onclose = () => {
    setStatus('disconnected')
    scheduleReconnect()
  }
  ws.onerror = () => { setStatus('disconnected') }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000)
  reconnectAttempts++
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectSocket()
  }, delay)
}

export function disconnectSocket() {
  if (ws) { ws.close(); ws = null }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
}

export function isSocketOpen() {
  return !!ws && ws.readyState === 1
}
