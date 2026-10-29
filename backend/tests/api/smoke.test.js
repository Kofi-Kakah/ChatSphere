import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { startTestDatabase } from '../helpers/db.js'
import { createTestApp } from '../helpers/server.js'
import { registerUser } from '../helpers/auth.js'

describe('API smoke', () => {
  let db
  let app

  beforeAll(async () => {
    db = await startTestDatabase('api')
    ;({ app } = createTestApp())
  })

  afterAll(async () => {
    await db.stop()
  })

  it('reports health against the in-memory test database', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', database: 'connected' })
  })

  it('registers a unique user and never returns a password hash', async () => {
    const { res, payload } = await registerUser(app, { prefix: 'alice' })
    expect(res.status).toBe(201)
    expect(res.body.user.username).toBe(payload.username)
    expect(typeof res.body.accessToken).toBe('string')
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/i)
  })

  it('logs in by email and rejects a wrong password', async () => {
    const { payload } = await registerUser(app, { prefix: 'bob' })
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: payload.email, password: payload.password })
    expect(login.status).toBe(200)
    expect(login.body.accessToken).toBeTruthy()

    const rejected = await request(app)
      .post('/api/auth/login')
      .send({ identifier: payload.email, password: 'not-the-password' })
    expect(rejected.status).toBe(401)
    expect(rejected.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('always runs on a test database', () => {
    expect(db.name).toMatch(/test/i)
  })
})
