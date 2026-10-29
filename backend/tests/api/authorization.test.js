import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDatabase } from '../helpers/db.js'
import { createTestApp } from '../helpers/server.js'
import { createUser, createDirectConversation, ensureIndexes } from '../helpers/factories.js'

let db
let app
let config
let alice
let bob
let conversation

beforeAll(async () => {
  db = await startTestDatabase('api_authorization')
  ;({ app, config } = createTestApp())
  await ensureIndexes()
  ;[alice, bob] = await Promise.all([
    createUser(config, { username: 'alice_authz', displayName: 'Alice' }),
    createUser(config, { username: 'bob_authz', displayName: 'Bob' }),
  ])
  conversation = await createDirectConversation(alice.user, bob.user)
})

afterAll(async () => {
  await db.stop()
})

function protectedRoutes() {
  const aliceId = String(alice.user._id)
  const bobId = String(bob.user._id)
  const conversationId = String(conversation._id)
  const uploadId = String(new mongoose.Types.ObjectId())

  return [
    { method: 'get', path: '/api/auth/me' },
    { method: 'get', path: '/api/users/search?q=a' },
    { method: 'get', path: `/api/users/${aliceId}` },
    { method: 'patch', path: '/api/users/me', body: { displayName: 'Renamed' } },
    { method: 'get', path: '/api/conversations' },
    { method: 'post', path: '/api/conversations/direct', body: { userId: bobId } },
    { method: 'post', path: '/api/conversations/group', body: { name: 'No Auth', memberIds: [aliceId, bobId] } },
    { method: 'get', path: `/api/conversations/${conversationId}/messages` },
    { method: 'patch', path: `/api/conversations/${conversationId}`, body: { name: 'No Auth' } },
    { method: 'post', path: `/api/conversations/${conversationId}/members`, body: { userIds: [bobId] } },
    { method: 'delete', path: `/api/conversations/${conversationId}/members/${bobId}` },
    { method: 'post', path: `/api/conversations/${conversationId}/leave` },
    { method: 'post', path: '/api/uploads' },
    { method: 'get', path: `/api/uploads/${uploadId}` },
    { method: 'get', path: '/api/calls/ice-config' },
  ]
}

describe('REST authorization: every protected route rejects anonymous callers', () => {
  it('returns 401 with a stable shape for all protected REST routes', async () => {
    for (const route of protectedRoutes()) {
      const res = await request(app)[route.method](route.path).send(route.body ?? {})
      expect(res.status, `${route.method.toUpperCase()} ${route.path}`).toBe(401)
      expect(res.body.error.code, `${route.method.toUpperCase()} ${route.path}`).toBe('UNAUTHORIZED')
      expect(res.body.error.message).toBe('Unauthorized')
    }
  })

  it('rejects unsupported or malformed authorization schemes', async () => {
    const attempts = ['Basic dXNlcjpwYXNz', 'Bearer', 'Bearer not-a-jwt', 'Token abc123']

    for (const authorization of attempts) {
      const res = await request(app).get('/api/conversations').set('Authorization', authorization)
      expect(res.status, authorization).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
    }
  })
})
