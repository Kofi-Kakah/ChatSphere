import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { startTestDatabase } from '../helpers/db.js'
import { startTestServer } from '../helpers/server.js'
import {
  createDirectConversation,
  createUser,
  idOf,
  seedMessages,
  suffix,
} from '../helpers/factories.js'
import { Conversation } from '../../src/models/Conversation.js'
import { User } from '../../src/models/User.js'

const SEEDED_CONVERSATIONS = 120

describe('list queries are bounded (DB-008)', () => {
  let db
  let server
  let alice
  let bob
  let conversation
  let searchPrefix

  beforeAll(async () => {
    db = await startTestDatabase('db-limits')
    server = await startTestServer()
    alice = await createUser(server.config)
    bob = await createUser(server.config)
    conversation = await createDirectConversation(alice.user, bob.user)

    const now = new Date()
    await Conversation.insertMany(
      Array.from({ length: SEEDED_CONVERSATIONS }, (_, index) => ({
        type: 'group',
        name: `seed group ${index}`,
        participants: [
          { user: alice.user._id, role: 'admin', joinedAt: now },
          { user: bob.user._id, role: 'member', joinedAt: now },
        ],
        lastMessageAt: new Date(now.getTime() - index * 1000),
        createdAt: now,
        updatedAt: now,
      })),
    )

    searchPrefix = `search${suffix()}`
    await User.insertMany(
      Array.from({ length: 25 }, (_, index) => ({
        username: `${searchPrefix}${index}`,
        email: `${searchPrefix}_${index}@example.test`,
        displayName: `Search ${index}`,
        passwordHash: 'not-a-real-hash',
      })),
    )
  })

  afterAll(async () => {
    await server.stop()
    await db.stop()
  })

  it('DB-008: message history is capped at 100 messages per page', async () => {
    await seedMessages({ conversation, sender: alice.user, count: 150 })

    const defaultPage = await request(server.app)
      .get(`/api/conversations/${idOf(conversation)}/messages`)
      .set(alice.header)
    expect(defaultPage.status).toBe(200)
    expect(defaultPage.body.messages).toHaveLength(30)
    expect(defaultPage.body.messages.at(-1).text).toBe('message 150')

    const oversized = await request(server.app)
      .get(`/api/conversations/${idOf(conversation)}/messages?limit=500`)
      .set(alice.header)
    expect(oversized.status).toBe(200)
    expect(oversized.body.messages).toHaveLength(100)
  })

  it('DB-008: user search is capped at 20 results', async () => {
    const response = await request(server.app)
      .get(`/api/users/search?q=${searchPrefix}`)
      .set(alice.header)
    expect(response.status).toBe(200)
    expect(response.body.users.length).toBeLessThanOrEqual(20)
  })

  it.fails('BUG-030 / DB-008: the conversation list is bounded and paginated', async () => {
    const response = await request(server.app).get('/api/conversations').set(alice.header)
    expect(response.status).toBe(200)
    const list = response.body.conversations
    expect(list.length, `${list.length} conversations returned in one unpaginated response`)
      .toBeLessThanOrEqual(100)
    expect(
      response.body.nextCursor ?? response.body.hasMore ?? response.body.total,
      'no pagination metadata for the remaining conversations',
    ).toBeDefined()
  })
})
