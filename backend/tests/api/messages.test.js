import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDatabase } from '../helpers/db.js'
import { createTestApp } from '../helpers/server.js'
import {
  createUser,
  createDirectConversation,
  seedMessages,
  ensureIndexes,
} from '../helpers/factories.js'

let db
let app
let config
let alice
let bob
let dave
let eve
let direct
let emptyDirect
let seeded

beforeAll(async () => {
  db = await startTestDatabase('api_messages')
  ;({ app, config } = createTestApp())
  await ensureIndexes()
  ;[alice, bob, dave, eve] = await Promise.all([
    createUser(config, { username: 'alice_msg', displayName: 'Alice' }),
    createUser(config, { username: 'bob_msg', displayName: 'Bob' }),
    createUser(config, { username: 'dave_msg', displayName: 'Dave' }),
    createUser(config, { username: 'eve_msg', displayName: 'Eve' }),
  ])
  direct = await createDirectConversation(alice.user, bob.user)
  emptyDirect = await createDirectConversation(alice.user, eve.user)
  seeded = await seedMessages({ conversation: direct, sender: bob.user, count: 35 })
})

afterAll(async () => {
  await db.stop()
})

async function history(asUser, conversationId, query = {}) {
  return request(app)
    .get(`/api/conversations/${conversationId}/messages`)
    .set(asUser.header)
    .query(query)
}

describe('REST GET /api/conversations/:id/messages', () => {
  it('CHAT-003/011: a participant receives the newest page in chronological order', async () => {
    const res = await history(alice, direct._id)

    expect(res.status).toBe(200)
    expect(res.body.messages).toHaveLength(30)
    expect(res.body.messages[0].text).toBe('message 6')
    expect(res.body.messages.at(-1).text).toBe('message 35')

    const timestamps = res.body.messages.map((message) => new Date(message.createdAt).getTime())
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b))
  })

  it('CHAT-011: limit caps the page size', async () => {
    const res = await history(alice, direct._id, { limit: 10 })

    expect(res.status).toBe(200)
    expect(res.body.messages).toHaveLength(10)
    expect(res.body.messages[0].text).toBe('message 26')
    expect(res.body.messages.at(-1).text).toBe('message 35')
  })

  it('CHAT-011: before returns older messages without duplicates or gaps', async () => {
    const res = await history(alice, direct._id, { before: String(seeded[20]._id), limit: 10 })

    expect(res.status).toBe(200)
    expect(res.body.messages).toHaveLength(10)
    expect(res.body.messages[0].text).toBe('message 11')
    expect(res.body.messages.at(-1).text).toBe('message 20')
  })

  it('CHAT-015: a non-participant is forbidden', async () => {
    const res = await history(dave, direct._id)
    expect(res.status).toBe(403)
  })

  it('CHAT-015: an unknown conversation returns 404', async () => {
    const res = await history(alice, new mongoose.Types.ObjectId())
    expect(res.status).toBe(404)
  })

  it('CHAT-011: a malformed conversation id returns 400, not 500', async () => {
    const res = await history(alice, 'not-an-object-id')
    expect(res.status).toBe(400)
  })

  it('CHAT-003: an empty conversation returns an empty page', async () => {
    const res = await history(alice, emptyDirect._id)
    expect(res.status).toBe(200)
    expect(res.body.messages).toEqual([])
  })

  it('CHAT-015: history requires authentication', async () => {
    const res = await request(app).get(`/api/conversations/${direct._id}/messages`)
    expect(res.status).toBe(401)
  })
})
