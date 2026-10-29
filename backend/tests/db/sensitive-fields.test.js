import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { startTestDatabase } from '../helpers/db.js'
import { startTestServer } from '../helpers/server.js'
import { createDirectConversation, createUser, idOf } from '../helpers/factories.js'
import { User } from '../../src/models/User.js'
import { RefreshToken } from '../../src/models/RefreshToken.js'

function expectNoSecrets(body, label) {
  const text = JSON.stringify(body)
  expect(text, label).not.toMatch(/passwordHash/i)
  expect(text, label).not.toMatch(/tokenHash/i)
  expect(text, label).not.toMatch(/refreshToken/i)
}

describe('sensitive fields never leave the server (DB-009)', () => {
  let db
  let server
  let alice
  let bob
  let conversation
  let login

  beforeAll(async () => {
    db = await startTestDatabase('db-secrets')
    server = await startTestServer()
    alice = await createUser(server.config)
    bob = await createUser(server.config)
    conversation = await createDirectConversation(alice.user, bob.user)

    login = await request(server.app)
      .post('/api/auth/login')
      .send({ identifier: alice.user.username, password: alice.password })
    expect(login.status).toBe(200)
  })

  afterAll(async () => {
    await server.stop()
    await db.stop()
  })

  it('DB-009: the User model hides passwordHash by default while storing token hashes', async () => {
    const user = await User.findById(alice.user._id)
    expect(user.passwordHash).toBeUndefined()

    const token = await RefreshToken.findOne({ user: alice.user._id }).lean()
    expect(token.tokenHash).toEqual(expect.any(String))
    expect(token.tokenHash.length).toBeGreaterThan(20)
  })

  it('DB-009: login and refresh return no password or refresh token in the JSON body', async () => {
    expectNoSecrets(login.body, 'login body')

    const cookies = login.headers['set-cookie'] ?? []
    const refreshCookie = cookies.find((cookie) => cookie.startsWith('refreshToken='))
    expect(refreshCookie).toBeDefined()
    const rawRefreshToken = refreshCookie.split(';')[0].split('=').slice(1).join('=')

    const agent = request.agent(server.app)
    await agent.post('/api/auth/login').send({ identifier: alice.user.username, password: alice.password })
    const refreshed = await agent.post('/api/auth/refresh')
    expect(refreshed.status).toBe(200)
    expectNoSecrets(refreshed.body, 'refresh body')

    const rotatedCookie = (refreshed.headers['set-cookie'] ?? [])
      .find((cookie) => cookie.startsWith('refreshToken='))
    expect(rotatedCookie).toBeDefined()
    const rotatedToken = rotatedCookie.split(';')[0].split('=').slice(1).join('=')
    expect(rotatedToken).not.toBe(rawRefreshToken)
  })

  it('DB-009: user, conversation, and search responses expose no sensitive fields', async () => {
    const authorization = { Authorization: `Bearer ${login.body.accessToken}` }

    const me = await request(server.app).get('/api/auth/me').set(authorization)
    expect(me.status).toBe(200)
    expectNoSecrets(me.body, '/auth/me')

    const profile = await request(server.app).get(`/api/users/${idOf(alice.user)}`).set(authorization)
    expect(profile.status).toBe(200)
    expectNoSecrets(profile.body, '/users/:id')

    const search = await request(server.app)
      .get(`/api/users/search?q=${alice.user.username.slice(0, 4)}`)
      .set(authorization)
    expect(search.status).toBe(200)
    expectNoSecrets(search.body, '/users/search')

    const updated = await request(server.app)
      .patch('/api/users/me')
      .set(authorization)
      .send({ bio: 'QA bio' })
    expect(updated.status).toBe(200)
    expectNoSecrets(updated.body, 'PATCH /users/me')

    const conversations = await request(server.app).get('/api/conversations').set(authorization)
    expect(conversations.status).toBe(200)
    expect(conversations.body.conversations.some((entry) => idOf(entry) === idOf(conversation))).toBe(true)
    expectNoSecrets(conversations.body, '/conversations')
  })
})
