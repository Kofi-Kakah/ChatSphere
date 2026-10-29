import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import { assertTestDatabaseName } from '../helpers/db.js'
import { startTcpProxy } from '../helpers/db-proxy.js'
import { startTestServer } from '../helpers/server.js'
import { createDirectConversation, createUser, idOf } from '../helpers/factories.js'
import { connectReady, disconnectAll, drainPresenceGrace, emitAckOrNull, emitWithAck } from '../helpers/socket.js'

async function waitUntil(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return false
}

function loggedEvents(lines) {
  return lines
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

describe('database outage and recovery (DB-007)', () => {
  let dbName
  let mongo
  let proxy
  let server
  let alice
  let bob
  let conversation
  let socket

  beforeAll(async () => {
    dbName = `chatsphere_test_outage_${randomBytes(4).toString('hex')}`
    assertTestDatabaseName(dbName)

    mongo = await MongoMemoryServer.create({ instance: { dbName } })
    const mongoPort = mongo.instanceInfo?.port ?? mongo.instance.port
    proxy = await startTcpProxy(mongoPort)

    await mongoose.connect(`mongodb://127.0.0.1:${proxy.port}/${dbName}?directConnection=true`, {
      dbName,
      serverSelectionTimeoutMS: 1500,
      heartbeatFrequencyMS: 500,
      connectTimeoutMS: 1000,
    })
    assertTestDatabaseName(mongoose.connection.name)

    server = await startTestServer()
    alice = await createUser(server.config)
    bob = await createUser(server.config)
    conversation = await createDirectConversation(alice.user, bob.user)
    socket = (await connectReady(server.url, alice.token)).socket

    const warmup = await request(server.app).get('/api/conversations').set(alice.header)
    expect(warmup.status).toBe(200)

    proxy.pause()
    const detected = await waitUntil(() => mongoose.connection.readyState !== 1, 8000)
    expect(detected, 'driver did not detect the outage').toBe(true)
  })

  afterAll(async () => {
    proxy?.resume()
    if (socket) disconnectAll([socket])
    await drainPresenceGrace()
    await server?.stop()
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect()
    await proxy?.close()
    await mongo?.stop()
  })

  it('DB-007: health reports the database as unavailable and the process stays up', async () => {
    const health = await request(server.app).get('/api/health')
    expect(health.status).toBe(503)
    expect(health.body).toMatchObject({ status: 'unavailable', database: 'disconnected' })

    const second = await request(server.app).get('/api/health')
    expect(second.status).toBe(503)
  })

  it('DB-007: a failed request is logged once and does not crash the server', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let status
    let lines
    try {
      const response = await request(server.app).get('/api/conversations').set(alice.header)
      status = response.status
    } finally {
      lines = spy.mock.calls.map(([line]) => line)
      spy.mockRestore()
    }

    const requestLogs = loggedEvents(lines).filter((entry) => entry.event === 'request_failed')
    expect(requestLogs, `request status was ${status}`).toHaveLength(1)
    expect(requestLogs[0]).toMatchObject({ level: 'error', event: 'request_failed' })

    const health = await request(server.app).get('/api/health')
    expect(health.status).toBe(503)
  })

  it.fails('BUG-029 / DB-007: a database outage returns a clean 503 with a stable error code', async () => {
    const response = await request(server.app).get('/api/conversations').set(alice.header)
    expect(response.status).toBe(503)
    expect(response.body.error?.code).toBe('SERVICE_UNAVAILABLE')
    expect(JSON.stringify(response.body)).not.toMatch(
      /ECONNRESET|MongoServerSelectionError|MongoNetworkError|server selection/i,
    )
  })

  it('DB-007: a socket send during the outage receives an error ack instead of hanging', async () => {
    const ack = await emitAckOrNull(socket, 'message:send', {
      conversationId: idOf(conversation),
      clientId: randomUUID(),
      type: 'text',
      text: 'during outage',
    }, 5000)

    expect(ack, 'message:send was never acknowledged').not.toBeNull()
    expect(ack.ok).toBe(false)
  })

  it('DB-007: the API and socket handler recover automatically when the database returns', async () => {
    proxy.resume()
    expect(await waitUntil(() => mongoose.connection.readyState === 1, 8000)).toBe(true)

    const response = await request(server.app).get('/api/conversations').set(alice.header)
    expect(response.status).toBe(200)
    expect(response.body.conversations.some((entry) => idOf(entry) === idOf(conversation))).toBe(true)

    const ack = await emitWithAck(socket, 'message:send', {
      conversationId: idOf(conversation),
      clientId: randomUUID(),
      type: 'text',
      text: 'after recovery',
    }, 5000)
    expect(ack.ok, JSON.stringify(ack)).toBe(true)
  })
})
