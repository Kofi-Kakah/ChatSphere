import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDatabase } from '../helpers/db.js'
import { createTestApp } from '../helpers/server.js'
import { createUser, ensureIndexes } from '../helpers/factories.js'
import { Conversation } from '../../src/models/Conversation.js'
import { Message } from '../../src/models/Message.js'

let db
let app
let config
let alice
let bob
let dave
let eve
let frank

beforeAll(async () => {
  db = await startTestDatabase('api_conversations')
  ;({ app, config } = createTestApp())
  await ensureIndexes()
  ;[alice, bob, dave, eve, frank] = await Promise.all([
    createUser(config, { username: 'alice_chat', displayName: 'Alice' }),
    createUser(config, { username: 'bob_chat', displayName: 'Bob' }),
    createUser(config, { username: 'dave_chat', displayName: 'Dave' }),
    createUser(config, { username: 'eve_chat', displayName: 'Eve' }),
    createUser(config, { username: 'frank_chat', displayName: 'Frank' }),
  ])
})

afterAll(async () => {
  await db.stop()
})

async function createDirect(asUser, targetUser) {
  const res = await request(app)
    .post('/api/conversations/direct')
    .set(asUser.header)
    .send({ userId: String(targetUser.user._id) })
  return res
}

async function createGroup(asUser, memberUsers, name = 'QA Group') {
  return request(app)
    .post('/api/conversations/group')
    .set(asUser.header)
    .send({ name, memberIds: memberUsers.map((user) => String(user.user._id)) })
}

describe('REST /api/conversations', () => {
  it('CHAT-001: starting a direct chat creates it once and repeats return the same conversation', async () => {
    const first = await createDirect(alice, bob)
    expect(first.status).toBe(201)
    expect(first.body.conversation.type).toBe('direct')
    expect(first.body.conversation.participants).toHaveLength(2)

    const second = await createDirect(bob, alice)
    expect(second.status).toBe(201)
    expect(String(second.body.conversation._id)).toBe(String(first.body.conversation._id))

    const count = await Conversation.countDocuments({ type: 'direct', 'participants.user': alice.user._id })
    expect(count).toBe(1)
  })

  it('CHAT-001: concurrent direct-chat creation produces exactly one conversation', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => createDirect(eve, frank)),
    )

    for (const res of results) {
      expect(res.status).toBe(201)
    }
    const ids = new Set(results.map((res) => String(res.body.conversation._id)))
    expect(ids.size).toBe(1)

    const directKey = [String(eve.user._id), String(frank.user._id)].sort().join('_')
    const count = await Conversation.countDocuments({ directKey })
    expect(count).toBe(1)
  })

  it('CHAT-002: an invalid target user id is rejected with 400', async () => {
    const res = await request(app)
      .post('/api/conversations/direct')
      .set(alice.header)
      .send({ userId: 'not-an-object-id' })

    expect(res.status).toBe(400)
  })

  it('CHAT-002 (open question): a chat with self is currently accepted', async () => {
    const res = await createDirect(dave, dave)

    expect(res.status).toBe(201)
    const stored = await Conversation.findById(res.body.conversation._id).lean()
    const participants = stored.participants.map((p) => String(p.user))
    expect(participants).toEqual([String(dave.user._id), String(dave.user._id)])
  })

  it('CHAT-002 (open question): a chat with a nonexistent user id is currently accepted', async () => {
    const ghostId = new mongoose.Types.ObjectId()
    const res = await request(app)
      .post('/api/conversations/direct')
      .set(alice.header)
      .send({ userId: String(ghostId) })

    expect(res.status).toBe(201)
    const stored = await Conversation.findById(res.body.conversation._id).lean()
    expect(stored.participants.map((p) => String(p.user))).toContain(String(ghostId))
  })

  it('GET /api/conversations returns only the caller conversations', async () => {
    const list = await request(app).get('/api/conversations').set(eve.header)
    expect(list.status).toBe(200)

    const ids = list.body.conversations.map((conversation) => String(conversation._id))
    expect(ids).toHaveLength(1)
    expect(list.body.conversations[0].participants.map((p) => String(p.user))).toEqual(
      expect.arrayContaining([String(eve.user._id), String(frank.user._id)]),
    )

    const outsiderList = await request(app).get('/api/conversations').set(alice.header)
    expect(outsiderList.body.conversations.map((c) => String(c._id))).not.toContain(ids[0])
  })

  it('GRP-001/002: creating a group requires at least two members and makes the creator admin', async () => {
    const res = await createGroup(alice, [bob, dave], 'Weekend Crew')

    expect(res.status).toBe(201)
    expect(res.body.conversation.type).toBe('group')
    expect(res.body.conversation.name).toBe('Weekend Crew')
    const participants = res.body.conversation.participants
    expect(participants).toHaveLength(3)
    const creator = participants.find((p) => String(p.user) === String(alice.user._id))
    expect(creator.role).toBe('admin')
    expect(participants.filter((p) => p.role === 'admin')).toHaveLength(1)

    const messages = await Message.find({ conversation: res.body.conversation._id }).lean()
    expect(messages.some((message) => message.type === 'system')).toBe(true)
  })

  it.each([
    ['no members', []],
    ['one member', null],
  ])('GRP-001: creating a group with %s is rejected with 400', async (_label, memberIds) => {
    const res = await request(app)
      .post('/api/conversations/group')
      .set(alice.header)
      .send({ name: 'Bad Group', memberIds: memberIds ?? [String(bob.user._id)] })

    expect(res.status).toBe(400)
  })

  it('GRP-001: an empty group name is rejected with 400', async () => {
    const res = await request(app)
      .post('/api/conversations/group')
      .set(alice.header)
      .send({ name: '', memberIds: [String(bob.user._id), String(dave.user._id)] })

    expect(res.status).toBe(400)
  })

  it.fails('BUG-007 (GRP-001): invalid member ids are rejected with a 4xx, not a 500', async () => {
    const res = await request(app)
      .post('/api/conversations/group')
      .set(alice.header)
      .send({ name: 'Bad Members', memberIds: ['not-an-id', String(bob.user._id)] })

    expect(res.status).toBeLessThan(500)
  })

  it.fails('BUG-010 (GRP-001): duplicate member ids do not create duplicate participants', async () => {
    const res = await createGroup(alice, [bob, bob], 'Duplicates')

    expect(res.status).toBe(201)
    const ids = res.body.conversation.participants.map((p) => String(p.user))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('GRP-003: an admin can add a member and the addition is persisted', async () => {
    const group = await createGroup(alice, [bob, dave])
    const id = group.body.conversation._id

    const res = await request(app)
      .post(`/api/conversations/${id}/members`)
      .set(alice.header)
      .send({ userIds: [String(eve.user._id)] })

    expect(res.status).toBe(200)
    expect(res.body.conversation.participants.map((p) => String(p.user))).toContain(String(eve.user._id))

    const stored = await Conversation.findById(id).lean()
    expect(stored.participants).toHaveLength(4)
    const messages = await Message.find({ conversation: id, type: 'system' }).lean()
    expect(messages.length).toBeGreaterThanOrEqual(2)
  })

  it('GRP-004: a non-admin cannot add members', async () => {
    const group = await createGroup(alice, [bob, dave])
    const res = await request(app)
      .post(`/api/conversations/${group.body.conversation._id}/members`)
      .set(bob.header)
      .send({ userIds: [String(eve.user._id)] })

    expect(res.status).toBe(403)
  })

  it('GRP-003/004: an admin can remove a member and a non-admin cannot', async () => {
    const group = await createGroup(alice, [bob, dave])
    const id = group.body.conversation._id

    const forbidden = await request(app)
      .delete(`/api/conversations/${id}/members/${String(dave.user._id)}`)
      .set(bob.header)
    expect(forbidden.status).toBe(403)

    const removed = await request(app)
      .delete(`/api/conversations/${id}/members/${String(dave.user._id)}`)
      .set(alice.header)
    expect(removed.status).toBe(200)
    expect(removed.body.conversation.participants.map((p) => String(p.user))).not.toContain(String(dave.user._id))
  })

  it('GRP-006: when the last admin leaves, the longest-standing member is promoted', async () => {
    const group = await createGroup(alice, [bob, dave])
    const id = group.body.conversation._id

    const res = await request(app).post(`/api/conversations/${id}/leave`).set(alice.header)

    expect(res.status).toBe(200)
    const stored = await Conversation.findById(id).lean()
    const admins = stored.participants.filter((p) => p.role === 'admin')
    expect(admins).toHaveLength(1)
    expect(String(admins[0].user)).toBe(String(bob.user._id))
    expect(stored.participants.map((p) => String(p.user))).not.toContain(String(alice.user._id))
  })

  it('GRP-003: an admin can rename a group and the rename persists', async () => {
    const group = await createGroup(alice, [bob, dave])
    const id = group.body.conversation._id

    const res = await request(app)
      .patch(`/api/conversations/${id}`)
      .set(alice.header)
      .send({ name: 'Renamed Crew' })

    expect(res.status).toBe(200)
    expect(res.body.conversation.name).toBe('Renamed Crew')
    const stored = await Conversation.findById(id).lean()
    expect(stored.name).toBe('Renamed Crew')
  })

  it.fails('BUG-005 (GRP-004): a non-admin member cannot rename a group', async () => {
    const group = await createGroup(alice, [bob, dave])
    const res = await request(app)
      .patch(`/api/conversations/${group.body.conversation._id}`)
      .set(bob.header)
      .send({ name: 'Taken Over' })

    expect(res.status).toBe(403)
  })

  it('GRP-012: a non-member cannot modify a group', async () => {
    const group = await createGroup(alice, [bob, dave])
    const res = await request(app)
      .patch(`/api/conversations/${group.body.conversation._id}`)
      .set(frank.header)
      .send({ name: 'Outsider Edit' })

    expect(res.status).toBe(403)
  })

  it.fails('BUG-014 (GRP-012): a non-member cannot leave a group they do not belong to', async () => {
    const group = await createGroup(alice, [bob, dave])
    const res = await request(app)
      .post(`/api/conversations/${group.body.conversation._id}/leave`)
      .set(frank.header)

    expect(res.status).toBe(403)
  })

  it.fails('BUG-004 (THEME-003/005): a direct participant can change the chat theme and a system message is posted', async () => {
    const direct = await createDirect(alice, bob)
    const id = direct.body.conversation._id

    const res = await request(app)
      .patch(`/api/conversations/${id}`)
      .set(alice.header)
      .send({ theme: 'love' })

    expect(res.status).toBe(200)
    expect(res.body.conversation.theme).toBe('love')

    const stored = await Conversation.findById(id).lean()
    expect(stored.theme).toBe('love')
    const systemMessages = await Message.find({ conversation: id, type: 'system' }).lean()
    expect(systemMessages.some((message) => /theme/i.test(message.text))).toBe(true)
  })

  it.fails('BUG-008 (THEME-006): an invalid theme value is rejected with a validation error', async () => {
    const direct = await createDirect(alice, dave)
    const res = await request(app)
      .patch(`/api/conversations/${direct.body.conversation._id}`)
      .set(alice.header)
      .send({ theme: 'neon' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('PATCH /api/conversations/:id returns 404 for an unknown conversation', async () => {
    const res = await request(app)
      .patch(`/api/conversations/${new mongoose.Types.ObjectId()}`)
      .set(alice.header)
      .send({ name: 'Nowhere' })

    expect(res.status).toBe(404)
  })

  it.fails('BUG-007 (PATCH /api/conversations/:id): a malformed id is rejected with a 4xx, not a 500', async () => {
    const res = await request(app)
      .patch('/api/conversations/not-an-object-id')
      .set(alice.header)
      .send({ name: 'Nowhere' })

    expect(res.status).toBeLessThan(500)
  })

  it.fails('BUG-011 (GRP-003/012): adding members to an unknown conversation returns 404, not 500', async () => {
    const res = await request(app)
      .post(`/api/conversations/${new mongoose.Types.ObjectId()}/members`)
      .set(alice.header)
      .send({ userIds: [String(bob.user._id)] })

    expect(res.status).toBe(404)
  })
})
