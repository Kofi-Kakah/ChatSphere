import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { startTestDatabase } from '../helpers/db.js'
import { startTestServer } from '../helpers/server.js'
import { createDirectConversation, createGroupConversation, createUser, idOf } from '../helpers/factories.js'
import { User } from '../../src/models/User.js'
import { Message } from '../../src/models/Message.js'
import { Upload } from '../../src/models/Upload.js'
import { makeZip } from '../fixtures/media-fixtures.js'
import {
  connectReady,
  disconnectAll,
  drainPresenceGrace,
  emitWithAck,
} from '../helpers/socket.js'

// Testing.md 6.1: NoSQL operators in every JSON field and query string, and
// stored XSS payloads in every user-controlled field.

let db
let server
let app
let alice
let bob
let dave
let direct
let group
let aliceSocket
let bobSocket
const sockets = []

const OPERATOR = { $ne: null }
const XSS = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>'
// File names are split on path separators, so the payload has no slash.
const FILE_XSS = '<img src=x onerror=window.__xss=1>.zip'

beforeAll(async () => {
  db = await startTestDatabase('security_injection')
  server = await startTestServer()
  app = server.app
  ;[alice, bob, dave] = await Promise.all([
    createUser(server.config, { username: 'alice_inj' }),
    createUser(server.config, { username: 'bob_inj' }),
    createUser(server.config, { username: 'dave_inj' }),
  ])
  direct = await createDirectConversation(alice.user, bob.user)
  group = await createGroupConversation({ creator: alice.user, members: [bob.user, dave.user], name: 'Injection Group' })
  aliceSocket = (await connectReady(server.url, alice.token)).socket
  bobSocket = (await connectReady(server.url, bob.token)).socket
  sockets.push(aliceSocket, bobSocket)
})

afterAll(async () => {
  disconnectAll(sockets)
  await drainPresenceGrace()
  await server.stop()
  await db.stop()
})

describe('NoSQL operator injection', () => {
  it('INJ-001: login rejects operator objects in every credential field', async () => {
    const payloads = [
      { identifier: OPERATOR, password: OPERATOR },
      { identifier: { $gt: '' }, password: { $gt: '' } },
      { identifier: alice.user.username, password: OPERATOR },
      { identifier: { $regex: '.*' }, password: alice.password },
    ]
    for (const payload of payloads) {
      const res = await request(app).post('/api/auth/login').send(payload)
      console.log(`[inj] login ${JSON.stringify(payload)} -> ${res.status}`)
      expect(res.status, JSON.stringify(payload)).toBe(400)
      expect(res.body.accessToken).toBeUndefined()
      expect(res.headers['set-cookie']).toBeUndefined()
    }
  })

  it('INJ-002: register rejects operator objects and creates no user', async () => {
    const before = await User.countDocuments({})
    const res = await request(app).post('/api/auth/register').send({
      username: OPERATOR,
      email: OPERATOR,
      displayName: OPERATOR,
      password: OPERATOR,
    })
    expect(res.status).toBe(400)
    expect(await User.countDocuments({})).toBe(before)
  })

  it('INJ-003: direct-chat creation rejects an operator userId without creating a conversation', async () => {
    const before = await request(app).get('/api/conversations').set(alice.header)
    const res = await request(app).post('/api/conversations/direct').set(alice.header).send({ userId: OPERATOR })
    console.log(`[inj] direct operator userId -> ${res.status} ${JSON.stringify(res.body)}`)
    expect(res.status).toBe(400)
    const after = await request(app).get('/api/conversations').set(alice.header)
    expect(after.body.conversations).toHaveLength(before.body.conversations.length)
  })

  it('INJ-004: bracket-syntax query operators are not interpreted as Mongo operators', async () => {
    for (const query of ['q[$ne]=x', 'q[$regex]=.*', 'q[$gt]=']) {
      const res = await request(app).get(`/api/users/search?${query}`).set(alice.header)
      console.log(`[inj] search ?${query} -> ${res.status} ${JSON.stringify(res.body)}`)
      expect(res.status, query).toBe(200)
      expect(res.body.users, query).toEqual([])
    }
  })

  it('INJ-005: operator-style history and media params cannot alter the query bounds', async () => {
    const messages = await request(app)
      .get(`/api/conversations/${direct._id}/messages?before[$ne]=x&limit[$gt]=0`)
      .set(alice.header)
    expect(messages.status).toBe(200)
    expect(messages.body.messages.length).toBeLessThanOrEqual(30)

    const media = await request(app)
      .get(`/api/conversations/${direct._id}/media?type[$ne]=x&before[$ne]=x&limit[$gt]=0`)
      .set(alice.header)
    expect(media.status).toBe(200)
    expect(Array.isArray(media.body.media)).toBe(true)

    const arrayLimit = await request(app)
      .get(`/api/conversations/${direct._id}/messages?limit=1&limit=2`)
      .set(alice.header)
    expect(arrayLimit.status).toBe(200)
    expect(arrayLimit.body.messages.length).toBeLessThanOrEqual(30)
  })

  it.fails('INJ-006 / BUG-087: an array-valued search term returns a 4xx, not a 500 with internal text', async () => {
    const res = await request(app).get('/api/users/search?q=alice&q=bob').set(alice.header)
    console.log(`[inj] search array q -> ${res.status} ${JSON.stringify(res.body)}`)
    expect([200, 400]).toContain(res.status)
    expect(JSON.stringify(res.body)).not.toMatch(/is not a function|TypeError|\.js:/)
  })

  it.fails('INJ-007 / BUG-087: an object-valued member list returns a 4xx, not a 500 with internal text', async () => {
    const res = await request(app)
      .post(`/api/conversations/${group._id}/members`)
      .set(alice.header)
      .send({ userIds: OPERATOR })
    console.log(`[inj] members operator userIds -> ${res.status} ${JSON.stringify(res.body)}`)
    expect([400, 422]).toContain(res.status)
  })

  it.fails('INJ-008 / BUG-007: an object-valued group name returns a 4xx, not a 500', async () => {
    const res = await request(app)
      .post('/api/conversations/group')
      .set(alice.header)
      .send({ name: OPERATOR, memberIds: [idOf(bob.user), idOf(dave.user)] })
    console.log(`[inj] group operator name -> ${res.status} ${JSON.stringify(res.body)}`)
    expect([400, 422]).toContain(res.status)
  })

  it.fails('INJ-009 / BUG-088: profile update rejects operator objects with a 4xx', async () => {
    const results = []
    for (const payload of [
      { displayName: OPERATOR },
      { bio: { $gt: '' } },
      { username: { $regex: '.*' } },
      { privacy: { $ne: null } },
    ]) {
      const res = await request(app).patch('/api/users/me').set(alice.header).send(payload)
      results.push({ payload, status: res.status, body: res.body })
      console.log(`[inj] profile ${JSON.stringify(payload)} -> ${res.status} ${JSON.stringify(res.body)}`)
    }
    const bad = results.filter((result) => result.status !== 400)
    expect(bad, JSON.stringify(bad)).toEqual([])
  })

  it('INJ-010: socket message:send rejects an operator conversationId with an error ack', async () => {
    const ack = await emitWithAck(aliceSocket, 'message:send', {
      conversationId: OPERATOR,
      clientId: crypto.randomUUID(),
      type: 'text',
      text: 'operator conversation',
    })
    console.log(`[inj] socket operator conversationId -> ${JSON.stringify(ack)}`)
    expect(ack.ok).toBe(false)
    expect(await Message.countDocuments({ text: 'operator conversation' })).toBe(0)
  })

  it.fails('INJ-011 / BUG-021: socket operator objects in text and clientId return a structured error', async () => {
    const textOperator = await emitWithAck(aliceSocket, 'message:send', {
      conversationId: String(direct._id),
      clientId: crypto.randomUUID(),
      type: 'text',
      text: OPERATOR,
    })
    const clientIdOperator = await emitWithAck(aliceSocket, 'message:send', {
      conversationId: String(direct._id),
      clientId: OPERATOR,
      type: 'text',
      text: 'operator clientId',
    })
    console.log(`[inj] socket text operator -> ${JSON.stringify(textOperator)}`)
    console.log(`[inj] socket clientId operator -> ${JSON.stringify(clientIdOperator)}`)

    for (const ack of [textOperator, clientIdOperator]) {
      expect(ack.ok).toBe(false)
      expect(ack.error && typeof ack.error).toBe('object')
      expect(Object.keys(ack.error || {})).toEqual(expect.arrayContaining(['code', 'message']))
    }
    expect(await Message.countDocuments({ text: 'operator clientId' })).toBe(0)
  })
})

describe('stored XSS payloads', () => {
  it('XSS-001: display name, bio, and username payloads are stored verbatim', async () => {
    const profile = await request(app).patch('/api/users/me').set(alice.header).send({
      displayName: XSS,
      bio: XSS,
    })
    expect(profile.status, JSON.stringify(profile.body)).toBe(200)

    const storedProfile = await User.findById(alice.user._id).lean()
    expect(storedProfile.displayName).toBe(XSS)
    expect(storedProfile.bio).toBe(XSS)

    const usernamePayload = 'x<img1>y2'
    const renamed = await request(app).patch('/api/users/me').set(dave.header).send({ username: usernamePayload })
    console.log(`[inj] username payload -> ${renamed.status} ${JSON.stringify(renamed.body)}`)
    expect(renamed.status).toBe(200)
    const storedDave = await User.findById(dave.user._id).lean()
    expect(storedDave.username).toBe(usernamePayload.toLowerCase())
  })

  it('XSS-002: a group name payload is stored verbatim and returned to both members', async () => {
    const res = await request(app)
      .post('/api/conversations/group')
      .set(alice.header)
      .send({ name: XSS, memberIds: [idOf(bob.user), idOf(dave.user)] })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    expect(res.body.conversation.name).toBe(XSS)

    const seenByBob = await request(app).get('/api/conversations').set(bob.header)
    expect(seenByBob.body.conversations.some((item) => item.name === XSS)).toBe(true)
  })

  it('XSS-003: message text and file-name payloads are stored verbatim', async () => {
    const ack = await emitWithAck(aliceSocket, 'message:send', {
      conversationId: String(direct._id),
      clientId: crypto.randomUUID(),
      type: 'text',
      text: XSS,
    })
    expect(ack.ok).toBe(true)
    const stored = await Message.findById(ack.message._id).lean()
    expect(stored.text).toBe(XSS)

    const uploaded = await request(app)
      .post('/api/uploads')
      .set(alice.header)
      .attach('file', makeZip([{ name: 'payload.txt', data: 'x' }]), {
        filename: FILE_XSS,
        contentType: 'application/zip',
      })
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201)
    const storedUpload = await Upload.findById(uploaded.body.uploadId).lean()
    console.log(`[inj] upload originalName -> ${JSON.stringify(storedUpload.originalName)}`)
    expect(storedUpload.originalName).toBe(FILE_XSS)

    const attachmentAck = await emitWithAck(aliceSocket, 'message:send', {
      conversationId: String(direct._id),
      clientId: crypto.randomUUID(),
      type: 'file',
      uploadIds: [uploaded.body.uploadId],
    })
    expect(attachmentAck.ok).toBe(true)
    const storedAttachment = await Message.findById(attachmentAck.message._id).lean()
    expect(storedAttachment.attachments[0].originalName).toBe(FILE_XSS)
  })
})
