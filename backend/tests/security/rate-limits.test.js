import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { startTestDatabase } from '../helpers/db.js'
import { startTestServer } from '../helpers/server.js'
import { createDirectConversation, createUser } from '../helpers/factories.js'
import {
  connectReady,
  disconnectAll,
  drainPresenceGrace,
  emitWithAck,
  recordEvents,
  waitForEvent,
} from '../helpers/socket.js'

// Testing.md 6.1: REST limits for login, register, and uploads; per-socket
// limits for message:send and typing:start; the server stays responsive.

let db
let server
let app
let alice
let bob
let direct
let aliceSocket
let bobSocket
const sockets = []

beforeAll(async () => {
  db = await startTestDatabase('security_rate_limits')
  server = await startTestServer()
  app = server.app
  ;[alice, bob] = await Promise.all([
    createUser(server.config, { username: 'alice_rate' }),
    createUser(server.config, { username: 'bob_rate' }),
  ])
  direct = await createDirectConversation(alice.user, bob.user)
  aliceSocket = (await connectReady(server.url, alice.token)).socket
  bobSocket = (await connectReady(server.url, bob.token)).socket
  sockets.push(aliceSocket, bobSocket)
})

afterAll(async () => {
  disconnectAll(sockets)
  await drainPresenceGrace()
  await server.stop()
  await db.stop()
})

function send(socket, text) {
  return emitWithAck(socket, 'message:send', {
    conversationId: String(direct._id),
    clientId: crypto.randomUUID(),
    type: 'text',
    text,
  })
}

describe('REST rate limits', () => {
  it('RATE-001: the 21st login attempt in the window is rejected, and register shares the budget', async () => {
    const statuses = []
    for (let attempt = 0; attempt < 21; attempt += 1) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'no_such_account', password: 'wrong-password' })
      statuses.push(res.status)
      if (res.status === 429) {
        console.log(`[rate] login 429 at attempt ${attempt + 1}: ${JSON.stringify(res.body)} headers=${JSON.stringify({
          ratelimit: res.headers.ratelimit,
          retryAfter: res.headers['retry-after'],
          contentType: res.headers['content-type'],
        })}`)
      }
    }
    const limited = statuses.filter((status) => status === 429)
    console.log(`[rate] login statuses: ${statuses.join(',')}`)
    expect(limited.length).toBeGreaterThan(0)
    expect(statuses.at(-1)).toBe(429)

    const register = await request(app).post('/api/auth/register').send({
      username: 'rate_check1',
      email: 'rate_check1@example.test',
      displayName: 'Rate Check',
      password: 'Passw0rd!234',
    })
    console.log(`[rate] register after login budget -> ${register.status} ${JSON.stringify(register.body)}`)
    expect(register.status).toBe(429)

    const health = await request(app).get('/api/health')
    expect(health.status).toBe(200)
  })

  it('RATE-002: the global API budget eventually rejects uploads and reports the limit', async () => {
    let firstLimited = null
    let limited = 0
    for (let attempt = 0; attempt < 320; attempt += 1) {
      const res = await request(app).post('/api/uploads')
      if (res.status === 429) {
        limited += 1
        if (!firstLimited) {
          firstLimited = res
          console.log(`[rate] upload 429 at attempt ${attempt + 1}: contentType=${res.headers['content-type']} body=${JSON.stringify(res.body)} ratelimit=${JSON.stringify(res.headers.ratelimit)} retryAfter=${res.headers['retry-after']}`)
        }
      }
    }
    expect(limited).toBeGreaterThan(0)
    expect(firstLimited.status).toBe(429)
    expect(firstLimited.headers['retry-after'] || firstLimited.headers.ratelimit).toBeTruthy()

    const health = await request(app).get('/api/health')
    console.log(`[rate] health after global budget -> ${health.status}`)
    expect(health.status).toBe(429)
  })
})

describe('per-socket rate limits', () => {
  it.fails('SOCKET-RATE-001 / BUG-022: a message:send flood is limited and the rejection is communicated', async () => {
    const acks = await Promise.all(Array.from({ length: 50 }, (_, index) => send(aliceSocket, `flood ${index}`)))
    const accepted = acks.filter((ack) => ack?.ok).length
    const rejected = acks.length - accepted
    console.log(`[rate] message:send flood accepted=${accepted} rejected=${rejected}`)
    expect(accepted).toBeLessThanOrEqual(20)
    expect(rejected).toBeGreaterThan(0)
  })

  it.fails('SOCKET-RATE-002 / BUG-022: a typing:start flood is limited', async () => {
    const bobEvents = recordEvents(bobSocket)
    for (let index = 0; index < 50; index += 1) {
      aliceSocket.emit('typing:start', { conversationId: String(direct._id) })
    }
    const marker = await send(aliceSocket, 'typing flood marker')
    expect(marker.ok).toBe(true)
    await waitForEvent(bobSocket, 'message:new', {
      predicate: (payload) => payload?.message?.text === 'typing flood marker',
    })
    const typingEvents = bobEvents.all('typing:update').length
    console.log(`[rate] typing:start flood delivered ${typingEvents} updates`)
    bobEvents.stop()
    expect(typingEvents).toBeLessThanOrEqual(20)
  })

  it('SOCKET-RATE-003: the server stays responsive to another user during a flood', async () => {
    await Promise.all(Array.from({ length: 50 }, (_, index) => send(aliceSocket, `responsiveness ${index}`)))
    const bobSees = waitForEvent(bobSocket, 'message:new', {
      predicate: (payload) => payload?.message?.text === 'still responsive',
    })
    const started = Date.now()
    const ack = await send(aliceSocket, 'still responsive')
    expect(ack.ok).toBe(true)
    await bobSees
    console.log(`[rate] responsiveness under flood: ${Date.now() - started}ms`)
  })
})
