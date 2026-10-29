import { io as createClient } from 'socket.io-client'

export function openSocket(url, token, options = {}) {
  return createClient(url, {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    timeout: 5000,
    ...options,
  })
}

export function waitForEvent(socket, event, { timeout = 5000, predicate } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler)
      reject(new Error(`Timed out waiting for ${event}`))
    }, timeout)

    function handler(payload) {
      if (predicate && !predicate(payload)) return
      clearTimeout(timer)
      socket.off(event, handler)
      resolve(payload)
    }

    socket.on(event, handler)
  })
}

export function waitForConnect(socket, timeout = 5000) {
  if (socket.connected) return Promise.resolve(socket)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Timed out waiting for socket connect'))
    }, timeout)

    function onConnect() {
      cleanup()
      resolve(socket)
    }
    function onError(error) {
      cleanup()
      reject(error instanceof Error ? error : new Error(String(error)))
    }
    function cleanup() {
      clearTimeout(timer)
      socket.off('connect', onConnect)
      socket.off('connect_error', onError)
    }

    socket.on('connect', onConnect)
    socket.on('connect_error', onError)
  })
}

export async function connectSocket(url, token, options = {}) {
  const socket = openSocket(url, token, options)
  await waitForConnect(socket)
  return socket
}

export function emitWithAck(socket, event, payload, timeout = 5000) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeout).emit(event, payload, (error, response) => {
      if (error) reject(error)
      else resolve(response)
    })
  })
}

// Resolves to null instead of rejecting when the server never acknowledges;
// used to assert an event is unimplemented without aborting the test.
export function emitAckOrNull(socket, event, payload, timeout = 800) {
  return new Promise((resolve) => {
    socket.timeout(timeout).emit(event, payload, (error, response) => {
      resolve(error ? null : response)
    })
  })
}

// Captures every event a socket receives so a "must not receive" assertion
// never needs to guess a wait window: assert after the allowed recipient has
// observed the event.
export function recordEvents(socket) {
  const events = []
  const handler = (event, ...args) => events.push({ event, payload: args[0] })
  socket.onAny(handler)
  return {
    events,
    received(event, predicate) {
      return events.some((entry) => entry.event === event && (!predicate || predicate(entry.payload)))
    },
    all(event) {
      return events.filter((entry) => entry.event === event).map((entry) => entry.payload)
    },
    clear() {
      events.length = 0
    },
    stop() {
      socket.offAny(handler)
    },
  }
}

// Regression guard for the server's presence grace timers: they touch the
// database 10 s after the last socket disconnects, so teardown cannot drop the
// connection underneath them.
export function drainPresenceGrace(ms = 10_500) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Connects and waits for the initial presence snapshot, so the server has
// finished joining rooms before a test starts emitting.
export async function connectReady(url, token, options = {}) {
  const socket = openSocket(url, token, options)
  const snapshot = waitForEvent(socket, 'presence:snapshot')
  // A failed handshake never delivers the snapshot; mark that wait as handled so
  // it cannot surface later as an unhandled rejection.
  snapshot.catch(() => {})
  try {
    await waitForConnect(socket)
    return { socket, snapshot: await snapshot }
  } catch (error) {
    socket.close()
    throw error
  }
}

export function disconnectAll(sockets) {
  for (const socket of sockets) {
    if (socket.connected) socket.disconnect()
    else socket.close()
  }
}

// Connects one socket per { name: token } entry so tests can assert
// "user X received this and user Y did not".
export async function connectClients(url, tokensByName, options = {}) {
  const entries = Object.entries(tokensByName)
  const sockets = await Promise.all(entries.map(([, token]) => connectSocket(url, token, options)))
  const clients = Object.fromEntries(entries.map(([name], index) => [name, sockets[index]]))
  return {
    clients,
    disconnect: () => disconnectAll(Object.values(clients)),
  }
}
