import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { startTestDatabase } from '../helpers/db.js'
import { createTestApp } from '../helpers/server.js'
import { buildUserPayload, registerUser } from '../helpers/auth.js'
import { User } from '../../src/models/User.js'

let db

beforeAll(async () => {
  db = await startTestDatabase('api_auth')
})

afterAll(async () => {
  await db.stop()
})

function freshApp() {
  return createTestApp()
}

function refreshCookie(res) {
  const cookies = res.headers['set-cookie'] || []
  return cookies.find((cookie) => cookie.startsWith('refreshToken=')) || ''
}

function cookiePair(cookie) {
  return cookie.split(';')[0]
}

describe('REST /api/auth', () => {
  it('AUTH-001: register returns 201, a safe user, a usable access token, and an HttpOnly refresh cookie', async () => {
    const { app } = freshApp()
    const payload = buildUserPayload()

    const res = await request(app).post('/api/auth/register').send(payload)

    expect(res.status).toBe(201)
    expect(res.body.user.username).toBe(payload.username)
    expect(res.body.user.email).toBe(payload.email)
    expect(res.body.user).not.toHaveProperty('passwordHash')
    expect(res.body).not.toHaveProperty('refreshToken')
    expect(typeof res.body.accessToken).toBe('string')

    const cookie = refreshCookie(res)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/api/auth')

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`)
    expect(me.status).toBe(200)
    expect(String(me.body.user._id)).toBe(String(res.body.user._id))
    expect(me.body.user).not.toHaveProperty('passwordHash')
  })

  it('AUTH-002: duplicate email is rejected with 409', async () => {
    const { app } = freshApp()
    const first = await registerUser(app)
    expect(first.res.status).toBe(201)

    const second = await registerUser(app, { email: first.payload.email })

    expect(second.res.status).toBe(409)
    expect(second.res.body.error.code).toBe('CONFLICT')
  })

  it('AUTH-002: duplicate email with different case is rejected with 409, not 500', async () => {
    const { app } = freshApp()
    const first = await registerUser(app)

    const second = await registerUser(app, { email: first.payload.email.toUpperCase() })

    expect(second.res.status).toBe(409)
    expect(second.res.body.error.code).toBe('CONFLICT')
  })

  it('AUTH-002: duplicate username with different case is rejected with 409, not 500', async () => {
    const { app } = freshApp()
    const first = await registerUser(app)

    const second = await registerUser(app, { username: first.payload.username.toUpperCase() })

    expect(second.res.status).toBe(409)
    expect(second.res.body.error.code).toBe('CONFLICT')
  })

  it.each([
    ['username shorter than 3 characters', { username: 'a1' }],
    ['username longer than 20 characters', { username: `a12${'b'.repeat(18)}` }],
    ['invalid email', { email: 'not-an-email' }],
    ['password shorter than 8 characters', { password: 'Aa1!aaa' }],
    ['empty display name', { displayName: '' }],
  ])('AUTH-003/004: register rejects %s with a validation error', async (_label, overrides) => {
    const { app } = freshApp()
    const res = await request(app).post('/api/auth/register').send(buildUserPayload(overrides))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('AUTH-004: register rejects a common password', async () => {
    const { app } = freshApp()
    const res = await request(app)
      .post('/api/auth/register')
      .send(buildUserPayload({ password: 'password' }))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('WEAK_PASSWORD')
  })

  it('AUTH-012: register ignores mass-assignment fields', async () => {
    const { app } = freshApp()
    const payload = buildUserPayload()
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...payload, role: 'admin', isAdmin: true, passwordHash: 'planted-hash', _id: '000000000000000000000000' })

    expect(res.status).toBe(201)
    expect(res.body.user.role).toBeUndefined()
    expect(res.body.user.isAdmin).toBeUndefined()

    const stored = await User.findById(res.body.user._id).select('+passwordHash').lean()
    expect(stored.role).toBeUndefined()
    expect(stored.isAdmin).toBeUndefined()
    expect(stored.passwordHash).not.toBe('planted-hash')
  })

  it('AUTH-005: login accepts email and username case-insensitively', async () => {
    const { app } = freshApp()
    const registered = await registerUser(app)
    const { email, username } = registered.payload

    const byEmail = await request(app)
      .post('/api/auth/login')
      .send({ identifier: email.toUpperCase(), password: registered.payload.password })
    expect(byEmail.status).toBe(200)
    expect(String(byEmail.body.user._id)).toBe(String(registered.user._id))

    const byUsername = await request(app)
      .post('/api/auth/login')
      .send({ identifier: username.toUpperCase(), password: registered.payload.password })
    expect(byUsername.status).toBe(200)
    expect(String(byUsername.body.user._id)).toBe(String(registered.user._id))
  })

  it('AUTH-006: wrong password and unknown account return the same generic 401', async () => {
    const { app } = freshApp()
    const registered = await registerUser(app)

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ identifier: registered.payload.email, password: 'WrongPass!234' })
    const unknownAccount = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'no_such_user_987', password: 'WrongPass!234' })

    expect(wrongPassword.status).toBe(401)
    expect(unknownAccount.status).toBe(401)
    expect(wrongPassword.body).toEqual(unknownAccount.body)
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('AUTH-013: tampered, expired, wrong-secret and alg=none access tokens are rejected', async () => {
    const { app, config } = freshApp()
    const registered = await registerUser(app)
    const validToken = registered.accessToken

    const expired = jwt.sign({ sub: String(registered.user._id) }, config.JWT_ACCESS_SECRET, { expiresIn: '-10s' })
    const wrongSecret = jwt.sign({ sub: String(registered.user._id) }, 'not-the-secret', { expiresIn: '15m' })
    const tampered = `${validToken.slice(0, -1)}${validToken.endsWith('a') ? 'b' : 'a'}`
    const algNone = [
      Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ sub: String(registered.user._id) })).toString('base64url'),
      '',
    ].join('.')

    for (const token of [expired, wrongSecret, tampered, algNone]) {
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
    }

    const noScheme = await request(app).get('/api/auth/me').set('Authorization', validToken)
    expect(noScheme.status).toBe(401)
  })

  it('AUTH-007/008: refresh rotates the token, old token reuse revokes the whole family', async () => {
    const { app } = freshApp()
    const registered = await registerUser(app)
    const cookie1 = cookiePair(refreshCookie(registered.res))

    const firstRefresh = await request(app).post('/api/auth/refresh').set('Cookie', cookie1)
    expect(firstRefresh.status).toBe(200)
    expect(firstRefresh.body.user).not.toHaveProperty('passwordHash')
    const cookie2 = cookiePair(refreshCookie(firstRefresh))
    expect(cookie2).not.toBe(cookie1)

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${firstRefresh.body.accessToken}`)
    expect(me.status).toBe(200)

    const reuse = await request(app).post('/api/auth/refresh').set('Cookie', cookie1)
    expect(reuse.status).toBe(401)
    expect(reuse.body.error.code).toBe('TOKEN_REUSE')

    const afterReuse = await request(app).post('/api/auth/refresh').set('Cookie', cookie2)
    expect(afterReuse.status).toBe(401)
  })

  it('AUTH-007: refresh without a cookie or with an unknown token is rejected with 401', async () => {
    const { app } = freshApp()

    const missing = await request(app).post('/api/auth/refresh')
    expect(missing.status).toBe(401)
    expect(missing.body.error.code).toBe('UNAUTHORIZED')

    const unknown = await request(app).post('/api/auth/refresh').set('Cookie', 'refreshToken=not-a-real-token')
    expect(unknown.status).toBe(401)
    expect(unknown.body.error.code).toBe('UNAUTHORIZED')
  })

  it('AUTH-009: logout clears the cookie and invalidates the refresh token', async () => {
    const { app } = freshApp()
    const registered = await registerUser(app)
    const cookie = cookiePair(refreshCookie(registered.res))

    const logout = await request(app).post('/api/auth/logout').set('Cookie', cookie)
    expect(logout.status).toBe(204)

    const refresh = await request(app).post('/api/auth/refresh').set('Cookie', cookie)
    expect(refresh.status).toBe(401)

    const anonymousLogout = await request(app).post('/api/auth/logout')
    expect(anonymousLogout.status).toBe(204)
  })

  it('AUTH-014: the refresh cookie is marked Secure when NODE_ENV is production', async () => {
    const { app } = freshApp()
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const res = await request(app).post('/api/auth/register').send(buildUserPayload())
      expect(res.status).toBe(201)
      expect(refreshCookie(res)).toContain('Secure')
    } finally {
      process.env.NODE_ENV = previous
    }
  })

  it('AUTH-005: login requires both identifier and password', async () => {
    const { app } = freshApp()
    const missingIdentifier = await request(app).post('/api/auth/login').send({ password: 'whatever' })
    const missingPassword = await request(app).post('/api/auth/login').send({ identifier: 'someone' })

    expect(missingIdentifier.status).toBe(400)
    expect(missingPassword.status).toBe(400)
    expect(missingIdentifier.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('AUTH-005: /api/auth/me returns 401 without a token', async () => {
    const { app } = freshApp()
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
  })
})
