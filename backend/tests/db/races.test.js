import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestDatabase } from '../helpers/db.js'
import { makeTestConfig } from '../helpers/config.js'
import { createDirectConversation, createUser, idOf, suffix } from '../helpers/factories.js'
import { User } from '../../src/models/User.js'
import { Conversation } from '../../src/models/Conversation.js'
import { Message } from '../../src/models/Message.js'
import { createMessage, findOrCreateDirect } from '../../src/services/conversation.service.js'

describe('database race conditions (DB-004, DB-005, DB-006)', () => {
  let db

  beforeAll(async () => {
    db = await startTestDatabase('db-races')
    await Promise.all([User.init(), Conversation.init(), Message.init()])
  })

  afterAll(async () => {
    await db.stop()
  })

  it('DB-004: concurrent direct-conversation creation produces exactly one conversation', async () => {
    const config = makeTestConfig()
    const alice = await createUser(config)
    const bob = await createUser(config)

    const attempts = Array.from({ length: 12 }, (_, index) => (
      index % 2 === 0
        ? findOrCreateDirect(alice.user._id, bob.user._id)
        : findOrCreateDirect(bob.user._id, alice.user._id)
    ))
    const results = await Promise.all(attempts)

    expect(results.every(Boolean), 'a concurrent caller received no conversation').toBe(true)
    expect(new Set(results.map((conversation) => idOf(conversation))).size).toBe(1)

    const directKey = [idOf(alice.user), idOf(bob.user)].sort().join('_')
    expect(await Conversation.countDocuments({ directKey })).toBe(1)
  })

  it('DB-005: concurrent sends with the same clientId store exactly one message', async () => {
    const config = makeTestConfig()
    const alice = await createUser(config)
    const bob = await createUser(config)
    const conversation = await createDirectConversation(alice.user, bob.user)
    const clientId = randomUUID()

    const settled = await Promise.allSettled(
      Array.from({ length: 10 }, (_, index) => createMessage({
        conversationId: idOf(conversation),
        sender: idOf(alice.user),
        type: 'text',
        text: `race send ${index}`,
        clientId,
      })),
    )

    const fulfilled = settled.filter((result) => result.status === 'fulfilled')
    const rejected = settled.filter((result) => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(9)
    expect(rejected.every((result) => result.reason?.code === 11000)).toBe(true)
    expect(await Message.countDocuments({ conversation: conversation._id, clientId })).toBe(1)
  })

  it('DB-006: concurrent username claims have exactly one winner', async () => {
    const username = `claim${suffix()}`
    const settled = await Promise.allSettled(
      Array.from({ length: 12 }, () => User.create({
        username,
        email: `claim_${suffix()}@example.test`,
        displayName: 'Claim Race',
        passwordHash: 'not-a-real-hash',
      })),
    )

    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = settled.filter((result) => result.status === 'rejected')
    expect(rejected).toHaveLength(11)
    expect(rejected.every((result) => result.reason?.code === 11000)).toBe(true)
    expect(await User.countDocuments({ username })).toBe(1)
  })

  it('DB-006: concurrent email claims have exactly one winner', async () => {
    const email = `claim_${suffix()}@example.test`
    const settled = await Promise.allSettled(
      Array.from({ length: 8 }, () => User.create({
        username: `claim${suffix()}`,
        email,
        displayName: 'Email Race',
        passwordHash: 'not-a-real-hash',
      })),
    )

    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(await User.countDocuments({ email })).toBe(1)
  })
})
