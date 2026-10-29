import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { startTestDatabase } from '../helpers/db.js'
import { createTestApp } from '../helpers/server.js'

describe('security smoke', () => {
  let db
  let app

  beforeAll(async () => {
    db = await startTestDatabase('security')
    ;({ app } = createTestApp())
  })

  afterAll(async () => {
    await db.stop()
  })

  it('sets helmet headers and hides the Express signature', async () => {
    const res = await request(app).get('/api/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('does not expose CORS headers to an origin outside the allowlist', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://untrusted.example')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('returns a clean 404 without a stack trace', async () => {
    const res = await request(app).get('/api/definitely-not-a-route')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js/i)
  })
})
