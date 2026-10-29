import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestDatabase } from '../helpers/db.js'
import { startTestServer } from '../helpers/server.js'
import { registerUser } from '../helpers/auth.js'
import { disconnectAll, openSocket, waitForConnect, waitForEvent } from '../helpers/socket.js'

describe('socket smoke', () => {
  let db
  let server
  let alice
  let bob
  const sockets = []

  beforeAll(async () => {
    db = await startTestDatabase('socket')
    server = await startTestServer()
    alice = await registerUser(server.app, { prefix: 'alice' })
    bob = await registerUser(server.app, { prefix: 'bob' })
    expect(alice.res.status).toBe(201)
    expect(bob.res.status).toBe(201)
  })

  afterAll(async () => {
    disconnectAll(sockets)
    await server.stop()
    await db.stop()
  })

  it('rejects a handshake with an invalid access token', async () => {
    const socket = openSocket(server.url, 'not-a-valid-jwt')
    sockets.push(socket)
    await expect(waitForConnect(socket)).rejects.toThrow(/unauthorized/i)
  })

  it('connects with a valid token and receives a presence snapshot', async () => {
    const socket = openSocket(server.url, bob.accessToken)
    sockets.push(socket)

    const snapshot = waitForEvent(socket, 'presence:snapshot')
    await waitForConnect(socket)
    const payload = await snapshot

    expect(Array.isArray(payload.users)).toBe(true)
    expect(payload.users.some((entry) => entry.userId === String(alice.user._id))).toBe(true)
  })
})
