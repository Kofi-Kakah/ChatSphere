import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { startTestDatabase } from '../helpers/db.js'
import { createTestApp } from '../helpers/server.js'
import { createUser, ensureIndexes } from '../helpers/factories.js'

let db
let app
let config
let alice

beforeAll(async () => {
  db = await startTestDatabase('api_calls')
  ;({ app, config } = createTestApp())
  await ensureIndexes()
  alice = await createUser(config, { username: 'alice_calls', displayName: 'Alice' })
})

afterAll(async () => {
  await db.stop()
})

describe('REST /api/calls', () => {
  it('CALL-017: the ICE config requires authentication', async () => {
    const res = await request(app).get('/api/calls/ice-config')
    expect(res.status).toBe(401)
  })

  it('CALL-017: an authenticated user receives STUN servers', async () => {
    const res = await request(app).get('/api/calls/ice-config').set(alice.header)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.iceServers)).toBe(true)
    expect(res.body.iceServers.length).toBeGreaterThanOrEqual(1)
    expect(res.body.iceServers[0].urls).toMatch(/^stun:/)
    for (const server of res.body.iceServers) {
      expect(typeof server.urls).toBe('string')
    }
    expect(JSON.stringify(res.body)).not.toMatch(/JWT_ACCESS_SECRET|JWT_REFRESH_SECRET/)
  })
})
