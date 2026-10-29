import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestDatabase } from '../helpers/db.js'
import { startTestServer } from '../helpers/server.js'
import { registerUser } from '../helpers/auth.js'
import { disconnectAll, openSocket, waitForConnect, waitForEvent } from '../helpers/socket.js'

const CLIENT_COUNT = 10

describe('load smoke', () => {
  let db
  let server
  let user
  const sockets = []

  beforeAll(async () => {
    db = await startTestDatabase('load')
    server = await startTestServer()
    user = await registerUser(server.app, { prefix: 'loaduser' })
    expect(user.res.status).toBe(201)
  })

  afterAll(async () => {
    disconnectAll(sockets)
    await server.stop()
    await db.stop()
  })

  it('connects 10 concurrent sockets and delivers a snapshot to each', async () => {
    const clients = Array.from({ length: CLIENT_COUNT }, () => {
      const socket = openSocket(server.url, user.accessToken)
      sockets.push(socket)
      return socket
    })

    const snapshots = clients.map((socket) => waitForEvent(socket, 'presence:snapshot', { timeout: 15_000 }))
    await Promise.all(clients.map((socket) => waitForConnect(socket, 15_000)))
    const payloads = await Promise.all(snapshots)

    expect(payloads).toHaveLength(CLIENT_COUNT)
    expect(clients.every((socket) => socket.connected)).toBe(true)
  }, 30_000)
})
