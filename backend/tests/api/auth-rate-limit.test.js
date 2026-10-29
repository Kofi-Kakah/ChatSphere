import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { startTestDatabase } from '../helpers/db.js'
import { createTestApp } from '../helpers/server.js'
import { buildUserPayload } from '../helpers/auth.js'

let db

beforeAll(async () => {
  db = await startTestDatabase('api_auth_rate_limit')
})

afterAll(async () => {
  await db.stop()
})

describe('REST /api/auth rate limiting', () => {
  it('AUTH-015: the 21st login attempt within the window returns 429 and blocks register too', async () => {
    const { app } = createTestApp()

    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'no_such_account_987', password: 'WrongPass!234' })
      expect(res.status).toBe(401)
    }

    const limitedLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'no_such_account_987', password: 'WrongPass!234' })
    expect(limitedLogin.status).toBe(429)

    const limitedRegister = await request(app)
      .post('/api/auth/register')
      .send(buildUserPayload())
    expect(limitedRegister.status).toBe(429)
  })

  it('AUTH-015: the limiter is per app instance and does not leak across fresh instances', async () => {
    const first = createTestApp()
    const second = createTestApp()

    for (let attempt = 1; attempt <= 20; attempt += 1) {
      await request(first.app)
        .post('/api/auth/login')
        .send({ identifier: 'no_such_account_987', password: 'WrongPass!234' })
    }

    const secondAppLogin = await request(second.app)
      .post('/api/auth/login')
      .send({ identifier: 'no_such_account_987', password: 'WrongPass!234' })
    expect(secondAppLogin.status).toBe(401)
  })
})
