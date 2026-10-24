import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { createApp } from '../src/app.js'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { loadConfig } from '../src/config/env.js'

describe('backend foundation', () => {
  let mongoServer
  let app

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create()
    await connectDatabase(mongoServer.getUri())
    app = createApp({ allowedOrigins: ['http://localhost:5173'] })
  })

  afterAll(async () => {
    await disconnectDatabase()
    await mongoServer.stop()
  })

  it('reports database connectivity from the health endpoint', async () => {
    const response = await request(app).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok', database: 'connected' })
    expect(response.headers['x-content-type-options']).toBe('nosniff')
  })

  it('does not allow an origin outside the configured CORS allowlist', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://untrusted.example')

    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('fails fast when required environment values are missing', () => {
    expect(() => loadConfig({})).toThrow(/MONGODB_URI/)
  })

  it('uses a MongoDB connection for persistence readiness', () => {
    expect(mongoose.connection.readyState).toBe(1)
  })
})
