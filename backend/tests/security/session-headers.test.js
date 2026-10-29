import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { signAccessToken } from '../../src/utils/jwt.js'
import { startTestDatabase } from '../helpers/db.js'
import { startTestServer } from '../helpers/server.js'
import { createDirectConversation, createUser, idOf } from '../helpers/factories.js'
import { TEST_PASSWORD } from '../helpers/factories.js'
import {
  connectReady,
  disconnectAll,
  drainPresenceGrace,
  emitWithAck,
  waitForConnect,
} from '../helpers/socket.js'
import { openSocket } from '../helpers/socket.js'

// Testing.md 6.1: JWT tampering and expiry mid-socket, logout with sockets open,
// CORS with credentials, helmet headers, error-body leakage, and CSRF.

let db
let server
let app
let alice
let bob
let dave
let direct
const sockets = []

beforeAll(async () => {
  db = await startTestDatabase('security_session_headers')
  server = await startTestServer()
  app = server.app
  ;[alice, bob, dave] = await Promise.all([
    createUser(server.config, { username: 'alice_sess' }),
    createUser(server.config, { username: 'bob_sess' }),
    createUser(server.config, { username: 'dave_sess' }),
  ])
  direct = await createDirectConversation(alice.user, bob.user)
})

afterAll(async () => {
  disconnectAll(sockets)
  await drainPresenceGrace()
  await server.stop()
  await db.stop()
})

async function loginCookie(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ identifier: user.user.username, password: TEST_PASSWORD })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  const cookies = res.headers['set-cookie'] || []
  console.log(`[sec] login cookie attributes: ${cookies.map((cookie) => cookie.split(';').slice(1).join(';')).join(' | ')}`)
  return { res, cookie: cookies[0].split(';')[0] }
}

describe('sessions, expiry, and logout', () => {
  it('SESS-001: an access token that expires mid-socket leaves the live connection usable (logged)', async () => {
    const shortToken = signAccessToken({ sub: String(alice.user._id) }, server.config.JWT_ACCESS_SECRET, '3s')
    // Derive the wait from the token's own exp: a fixed sleep after a 1 s token
    // made the handshake itself expire whenever the suite stalled under load.
    const { exp } = JSON.parse(Buffer.from(shortToken.split('.')[1], 'base64url').toString())
    const { socket } = await connectReady(server.url, shortToken)
    sockets.push(socket)
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, exp * 1000 - Date.now()) + 300))
    expect(socket.connected).toBe(true)
    const ack = await emitWithAck(socket, 'message:send', {
      conversationId: String(direct._id),
      clientId: crypto.randomUUID(),
      type: 'text',
      text: 'after token expiry',
    })
    console.log(`[sec] expired mid-socket send: connected=${socket.connected} ack=${JSON.stringify(ack)}`)
    expect(ack.ok, 'server stays responsive after the token expires; no revalidation is specified').toBe(true)
    socket.disconnect()
  })

  it('SESS-002: an expired access token cannot start a new socket', async () => {
    const expired = signAccessToken({ sub: String(dave.user._id) }, server.config.JWT_ACCESS_SECRET, '-10s')
    const socket = openSocket(server.url, expired)
    const error = await waitForConnect(socket).then(() => null).catch((err) => err)
    console.log(`[sec] expired handshake: ${error?.message}`)
    expect(error).toBeTruthy()
    expect(String(error.message)).toMatch(/unauthorized|timed out/i)
    socket.close()
  })

  it('SESS-003: logout revokes refresh while an open socket keeps its live access (logged)', async () => {
    const { cookie } = await loginCookie(alice)
    const { socket } = await connectReady(server.url, alice.token)
    sockets.push(socket)

    const logout = await request(app).post('/api/auth/logout').set('Cookie', cookie)
    expect(logout.status).toBe(204)

    const refresh = await request(app).post('/api/auth/refresh').set('Cookie', cookie)
    expect(refresh.status).toBe(401)

    const ack = await emitWithAck(socket, 'message:send', {
      conversationId: String(direct._id),
      clientId: crypto.randomUUID(),
      type: 'text',
      text: 'after logout',
    })
    console.log(`[sec] post-logout socket send: connected=${socket.connected} ok=${ack.ok}`)
    expect(ack.ok).toBe(true)
    socket.disconnect()
  })
})

describe('cookies and CSRF', () => {
  it('CSRF-001: the refresh cookie is HttpOnly, SameSite=Lax, and scoped to /api/auth', async () => {
    const { res } = await loginCookie(bob)
    const setCookie = (res.headers['set-cookie'] || []).join(';')
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
    expect(setCookie).toMatch(/Path=\/api\/auth/i)
  })

  it('CSRF-002: refresh and logout have no GET route, so navigation cannot trigger them', async () => {
    const refresh = await request(app).get('/api/auth/refresh')
    const logout = await request(app).get('/api/auth/logout')
    expect([404, 405]).toContain(refresh.status)
    expect([404, 405]).toContain(logout.status)
  })

  it('CSRF-003: a cross-site preflight is not granted, so a browser cannot read a refresh response', async () => {
    const { cookie } = await loginCookie(bob)
    const preflight = await request(app)
      .options('/api/auth/refresh')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST')
    console.log(`[sec] evil preflight -> ${preflight.status} ACAO=${preflight.headers['access-control-allow-origin']}`)
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined()

    const crossSite = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', 'https://evil.example')
      .set('Cookie', cookie)
    expect(crossSite.headers['access-control-allow-origin']).toBeUndefined()
    expect(crossSite.headers['access-control-allow-credentials']).not.toBe('true')
  })
})

describe('CORS and security headers', () => {
  it('HDR-001: helmet headers are present and x-powered-by is removed', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.headers['x-powered-by']).toBeUndefined()
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['content-security-policy']).toBeTruthy()
    expect(res.headers['referrer-policy']).toBeTruthy()
    expect(res.headers['x-frame-options'] || res.headers['content-security-policy']?.includes('frame-ancestors')).toBeTruthy()
    console.log(`[sec] headers: csp=${Boolean(res.headers['content-security-policy'])} co-op=${res.headers['cross-origin-opener-policy']} hsts=${res.headers['strict-transport-security']}`)
  })

  it('CORS-001: the allowed origin is echoed with credentials, without a wildcard', async () => {
    const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:5173')
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    expect(allowed.headers['access-control-allow-credentials']).toBe('true')
    expect(allowed.headers['access-control-allow-origin']).not.toBe('*')

    const evil = await request(app).get('/api/health').set('Origin', 'https://evil.example')
    expect(evil.headers['access-control-allow-origin']).toBeUndefined()
    expect(evil.headers['access-control-allow-credentials']).toBeUndefined()
  })

  it('CORS-002: the preflight for login grants only the allowlisted origin', async () => {
    const allowed = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')
    console.log(`[sec] allowed preflight -> ${allowed.status} ACAO=${allowed.headers['access-control-allow-origin']}`)
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    expect(allowed.headers['access-control-allow-credentials']).toBe('true')

    const evil = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST')
    expect(evil.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('error responses', () => {
  it('ERR-001: unauthenticated, not-found, and malformed-JSON errors use a stable shape', async () => {
    const unauthenticated = await request(app).get('/api/conversations')
    expect(unauthenticated.status).toBe(401)
    expect(unauthenticated.body.error.code).toBe('UNAUTHORIZED')

    const missing = await request(app).get('/api/does-not-exist').set(alice.header)
    expect(missing.status).toBe(404)
    expect(missing.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } })

    const malformed = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"identifier":')
    console.log(`[sec] malformed JSON -> ${malformed.status} ${JSON.stringify(malformed.body)}`)
    expect(malformed.status).toBe(400)
    expect(malformed.body.error).toBeTruthy()

    for (const res of [unauthenticated, missing, malformed]) {
      expect(res.body.stack).toBeUndefined()
      expect(JSON.stringify(res.body)).not.toMatch(/node_modules|\/src\/.*\.js/)
    }
  })

  it.fails('ERR-002 / BUG-007: a server error never exposes database internals', async () => {
    const res = await request(app)
      .post('/api/conversations/group')
      .set(alice.header)
      .send({ name: { $ne: null }, memberIds: [idOf(bob.user), idOf(dave.user)] })
    console.log(`[sec] 500 body -> ${res.status} ${JSON.stringify(res.body)}`)
    expect(res.status).toBe(500)
    expect(res.body.stack).toBeUndefined()
    expect(JSON.stringify(res.body)).not.toMatch(/Cast to|Validation failed|model "|MongoServerError|MongoError|\/src\//)
  })
})
