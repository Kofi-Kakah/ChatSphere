import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDatabase } from '../helpers/db.js'
import { createTestApp } from '../helpers/server.js'
import { createUser, ensureIndexes } from '../helpers/factories.js'
import { User } from '../../src/models/User.js'

let db
let app
let config
let alice
let bob
let dave

beforeAll(async () => {
  db = await startTestDatabase('api_users')
  ;({ app, config } = createTestApp())
  await ensureIndexes()
  ;[alice, bob, dave] = await Promise.all([
    createUser(config, { username: 'alice_user', displayName: 'Alice' }),
    createUser(config, { username: 'bob_user', displayName: 'Bob' }),
    createUser(config, { username: 'dave_user', displayName: 'Dave' }),
  ])
})

afterAll(async () => {
  await db.stop()
})

describe('REST /api/users', () => {
  it('PROF-008: search is empty for an empty query and case-insensitive for a partial username', async () => {
    const empty = await request(app).get('/api/users/search').set(alice.header).query({ q: '   ' })
    expect(empty.status).toBe(200)
    expect(empty.body).toEqual({ users: [] })

    const partial = await request(app).get('/api/users/search').set(alice.header).query({ q: 'BOB_US' })
    expect(partial.status).toBe(200)
    expect(partial.body.users).toHaveLength(1)
    expect(partial.body.users[0].username).toBe('bob_user')
  })

  it('PROF-009: search results never include email, passwordHash or tokens', async () => {
    const res = await request(app).get('/api/users/search').set(alice.header).query({ q: 'bob_user' })

    expect(res.status).toBe(200)
    const user = res.body.users[0]
    expect(user).toHaveProperty('username')
    expect(user).toHaveProperty('displayName')
    expect(user).not.toHaveProperty('email')
    expect(user).not.toHaveProperty('passwordHash')
    expect(JSON.stringify(res.body)).not.toMatch(/accessToken|refreshToken|passwordHash/)
  })

  it('PROF-008: search is bounded to 20 results', async () => {
    const aliceWithHash = await User.findById(alice.user._id).select('+passwordHash').lean()
    const stamp = Date.now()
    const bulk = Array.from({ length: 25 }, (_, index) => ({
      username: `bulk${index}_${stamp}`,
      email: `bulk${index}_${stamp}@example.test`,
      displayName: `Bulk ${index}`,
      passwordHash: aliceWithHash.passwordHash,
    }))
    await User.insertMany(bulk)

    const res = await request(app).get('/api/users/search').set(alice.header).query({ q: 'bulk' })
    expect(res.status).toBe(200)
    expect(res.body.users).toHaveLength(20)
  })

  it.fails('BUG-009 (PROF-008): regex metacharacters are treated literally, not as a pattern', async () => {
    const injection = await request(app).get('/api/users/search').set(alice.header).query({ q: '.*' })
    expect(injection.status).toBe(200)
    expect(injection.body.users).toHaveLength(0)
  })

  it.fails('BUG-009 (PROF-008): an invalid regular expression does not crash the search endpoint', async () => {
    const res = await request(app).get('/api/users/search').set(alice.header).query({ q: '(' })
    expect(res.status).toBeLessThan(500)
  })

  it('PROF-010: a profile lookup returns public fields and never leaks credentials', async () => {
    const res = await request(app).get(`/api/users/${bob.user._id}`).set(alice.header)

    expect(res.status).toBe(200)
    expect(res.body.user.username).toBe('bob_user')
    expect(res.body.user.displayName).toBe('Bob')
    expect(res.body.user).not.toHaveProperty('passwordHash')
    expect(res.body.user).not.toHaveProperty('email')
    expect(JSON.stringify(res.body)).not.toMatch(/accessToken|refreshToken|passwordHash/)
  })

  it('PROF-010: an unknown but well-formed user id returns 404', async () => {
    const res = await request(app)
      .get(`/api/users/${new mongoose.Types.ObjectId()}`)
      .set(alice.header)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it.fails('BUG-007 (PROF-010): a malformed user id is rejected with a 4xx, not a 500', async () => {
    const res = await request(app).get('/api/users/not-an-object-id').set(alice.header)
    expect(res.status).toBeLessThan(500)
  })

  it('PROF-001: a profile update persists display name and bio', async () => {
    const carol = await createUser(config, { username: 'carol_user', displayName: 'Carol' })

    const res = await request(app)
      .patch('/api/users/me')
      .set(carol.header)
      .send({ displayName: 'Carol Updated', bio: 'Hello from QA' })

    expect(res.status).toBe(200)
    expect(res.body.user.displayName).toBe('Carol Updated')
    expect(res.body.user.bio).toBe('Hello from QA')
    expect(res.body.user).not.toHaveProperty('passwordHash')

    const stored = await User.findById(carol.user._id).lean()
    expect(stored.displayName).toBe('Carol Updated')
    expect(stored.bio).toBe('Hello from QA')
  })

  it('PROF-005: privacy updates merge with existing settings', async () => {
    const res = await request(app)
      .patch('/api/users/me')
      .set(bob.header)
      .send({ privacy: { showLastSeen: false } })

    expect(res.status).toBe(200)
    expect(res.body.user.privacy).toEqual({
      showOnlineStatus: true,
      showLastSeen: false,
      sendReadReceipts: true,
    })

    const stored = await User.findById(bob.user._id).lean()
    expect(stored.privacy.showLastSeen).toBe(false)
    expect(stored.privacy.showOnlineStatus).toBe(true)
  })

  it('PROF-002: changing a username to one already taken returns 409', async () => {
    const res = await request(app)
      .patch('/api/users/me')
      .set(dave.header)
      .send({ username: 'alice_user' })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CONFLICT')
  })

  it.fails('BUG-013 (PROF-002): an invalid username is rejected with a validation error', async () => {
    const erin = await createUser(config, { username: 'erin_user', displayName: 'Erin' })

    const res = await request(app).patch('/api/users/me').set(erin.header).send({ username: 'x' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it.fails('BUG-008 (PROF-001): a bio longer than 160 characters is rejected with a validation error', async () => {
    const frank = await createUser(config, { username: 'frank_user', displayName: 'Frank' })

    const res = await request(app)
      .patch('/api/users/me')
      .set(frank.header)
      .send({ bio: 'x'.repeat(161) })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('AUTH-012: a profile update ignores mass-assignment fields', async () => {
    const grace = await createUser(config, { username: 'grace_user', displayName: 'Grace' })

    const res = await request(app)
      .patch('/api/users/me')
      .set(grace.header)
      .send({ displayName: 'Grace', role: 'admin', isAdmin: true, passwordHash: 'planted' })

    expect(res.status).toBe(200)
    const stored = await User.findById(grace.user._id).select('+passwordHash').lean()
    expect(stored.role).toBeUndefined()
    expect(stored.isAdmin).toBeUndefined()
    expect(stored.passwordHash).not.toBe('planted')
  })
})
