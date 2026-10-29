import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { startTestDatabase } from '../helpers/db.js'
import { createTestApp } from '../helpers/server.js'
import { registerUser } from '../helpers/auth.js'

// BUG-001 regression: requireAuth used to be a factory registered unwrapped,
// so protected routes never responded. These tests now assert the fixed behavior.
describe('BUG-001 regression: protected routes enforce auth', () => {
  let db
  let app

  beforeAll(async () => {
    db = await startTestDatabase('bugfix')
    ;({ app } = createTestApp())
  })

  afterAll(async () => {
    await db.stop()
  })

  it('returns 401 for an unauthenticated request to /api/conversations', async () => {
    const res = await request(app)
      .get('/api/conversations')
      .timeout({ response: 2000, deadline: 3000 })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 401 for a malformed bearer token', async () => {
    const res = await request(app)
      .get('/api/conversations')
      .set('Authorization', 'Bearer not-a-jwt')
      .timeout({ response: 2000, deadline: 3000 })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('lets a valid bearer token reach the handler', async () => {
    const { accessToken } = await registerUser(app, { prefix: 'bugfix' })
    const res = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${accessToken}`)
      .timeout({ response: 2000, deadline: 3000 })
    expect(res.status).toBe(200)
    expect(res.body.conversations).toEqual([])
  })
})
