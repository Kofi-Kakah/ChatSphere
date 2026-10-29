import { randomUUID } from 'node:crypto'
import request from 'supertest'
import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestDatabase } from '../helpers/db.js'
import { startTestServer } from '../helpers/server.js'
import { createDirectConversation, createMessage, createUser, idOf } from '../helpers/factories.js'
import { Upload } from '../../src/models/Upload.js'
import { Message } from '../../src/models/Message.js'
import {
  connectReady,
  disconnectAll,
  drainPresenceGrace,
  emitWithAck,
  recordEvents,
  waitForEvent,
} from '../helpers/socket.js'

describe('message:send', () => {
  let db
  let server
  let alice
  let bob
  let dave
  let conversation
  let aliceSocket
  let bobSocket
  let daveSocket
  const sockets = []

  beforeAll(async () => {
    db = await startTestDatabase('socket-messages')
    server = await startTestServer()
    alice = await createUser(server.config)
    bob = await createUser(server.config)
    dave = await createUser(server.config)
    conversation = await createDirectConversation(alice.user, bob.user)

    const aliceReady = await connectReady(server.url, alice.token)
    const bobReady = await connectReady(server.url, bob.token)
    const daveReady = await connectReady(server.url, dave.token)
    aliceSocket = aliceReady.socket
    bobSocket = bobReady.socket
    daveSocket = daveReady.socket
    sockets.push(aliceSocket, bobSocket, daveSocket)
  })

  afterAll(async () => {
    disconnectAll(sockets)
    await drainPresenceGrace()
    await server.stop()
    await db.stop()
  })

  function payload(overrides = {}) {
    return {
      conversationId: idOf(conversation),
      clientId: randomUUID(),
      type: 'text',
      text: 'hello from the socket',
      ...overrides,
    }
  }

  it('CHAT-003: persists the message, acks it, and broadcasts to the other member', async () => {
    const body = payload({ text: 'ack and persist' })
    const daveWitness = recordEvents(daveSocket)
    const received = waitForEvent(bobSocket, 'message:new', {
      predicate: (event) => event?.message?.clientId === body.clientId,
    }).catch(() => null)
    const ack = await emitWithAck(aliceSocket, 'message:send', body)
    expect(ack.ok, JSON.stringify(ack)).toBe(true)
    expect(ack.message).toMatchObject({
      conversation: idOf(conversation),
      sender: idOf(alice.user),
      text: 'ack and persist',
      clientId: body.clientId,
    })

    const event = await received
    expect(event).not.toBeNull()
    expect(event.message.id ?? event.message._id).toBeTruthy()
    const stored = await Message.findById(ack.message._id).lean()
    expect(stored.text).toBe('ack and persist')
    expect(String(stored.sender)).toBe(idOf(alice.user))
    expect(daveWitness.received('message:new')).toBe(false)
    daveWitness.stop()
  })

  it('CHAT-003: rejects a malformed conversation id with a clean error ack', async () => {
    const ack = await emitWithAck(aliceSocket, 'message:send', payload({ conversationId: 'not-an-id' }))
    expect(ack.ok).toBe(false)
    expect(ack.error).toBeTruthy()
  })

  it('CHAT-003: rejects an unknown conversation id with an error ack', async () => {
    const ack = await emitWithAck(aliceSocket, 'message:send', payload({ conversationId: String(new mongoose.Types.ObjectId()) }))
    expect(ack.ok).toBe(false)
  })

  it('CHAT-004: rejects a null payload with an error ack', async () => {
    const ack = await emitWithAck(aliceSocket, 'message:send', null)
    expect(ack.ok).toBe(false)
  })

  it('CHAT-004: rejects an unsupported message type', async () => {
    const ack = await emitWithAck(aliceSocket, 'message:send', payload({ type: 'video' }))
    expect(ack.ok).toBe(false)
  })

  it.fails('BUG-019 / CHAT-004: rejects empty text', async () => {
    const ack = await emitWithAck(aliceSocket, 'message:send', payload({ text: '' }))
    expect(ack.ok).toBe(false)
  })

  it.fails('BUG-019 / CHAT-004: rejects whitespace-only text', async () => {
    const ack = await emitWithAck(aliceSocket, 'message:send', payload({ text: '   \n\t  ' }))
    expect(ack.ok).toBe(false)
  })

  it('CHAT-004: accepts exactly 4000 characters', async () => {
    const ack = await emitWithAck(aliceSocket, 'message:send', payload({ text: 'a'.repeat(4000) }))
    expect(ack.ok).toBe(true)
    const stored = await Message.findById(ack.message._id).lean()
    expect(stored.text).toHaveLength(4000)
  })

  it.fails('BUG-019 / CHAT-004: rejects 4001 characters', async () => {
    const ack = await emitWithAck(aliceSocket, 'message:send', payload({ text: 'b'.repeat(4001) }))
    expect(ack.ok).toBe(false)
  })

  it('CHAT-005: preserves Unicode, emoji, RTL text, and HTML payloads verbatim', async () => {
    const text = 'Hello 👋🏽 אבגד مرحبا <img src=x onerror=alert(1)> <script>alert(1)</script>'
    const ack = await emitWithAck(aliceSocket, 'message:send', payload({ text }))
    expect(ack.ok).toBe(true)
    const stored = await Message.findById(ack.message._id).lean()
    expect(stored.text).toBe(text)
  })

  it('CHAT-008: a replayed clientId creates exactly one stored message', async () => {
    const body = payload({ text: 'dedupe me' })
    const first = await emitWithAck(aliceSocket, 'message:send', body)
    const second = await emitWithAck(aliceSocket, 'message:send', body)
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(second.message._id).toBe(first.message._id)
    const count = await Message.countDocuments({ conversation: idOf(conversation), clientId: body.clientId })
    expect(count).toBe(1)
  })

  it.fails('BUG-026 / CHAT-008: a replay does not rebroadcast a duplicate message:new', async () => {
    const body = payload({ text: 'dedupe broadcast' })
    const firstReceive = waitForEvent(bobSocket, 'message:new', {
      predicate: (event) => event?.message?.clientId === body.clientId,
    }).catch(() => null)
    await emitWithAck(aliceSocket, 'message:send', body)
    expect(await firstReceive).not.toBeNull()

    const witness = recordEvents(bobSocket)
    await emitWithAck(aliceSocket, 'message:send', body)
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(witness.all('message:new').filter((event) => event?.message?.clientId === body.clientId)).toHaveLength(0)
    witness.stop()
  })

  it('BUG-020 / FILE-001: attaches an owned, unattached upload and marks it attached', async () => {
    const upload = await Upload.create({
      owner: idOf(alice.user),
      storageKey: 'qa/owned.png',
      mimeType: 'image/png',
      size: 1234,
      originalName: 'owned.png',
      width: 10,
      height: 10,
      duration: 12,
    })
    const body = payload({ type: 'image', text: '', uploadIds: [idOf(upload)] })
    const received = waitForEvent(bobSocket, 'message:new', {
      predicate: (event) => event?.message?.clientId === body.clientId,
    }).catch(() => null)
    const ack = await emitWithAck(aliceSocket, 'message:send', body)
    expect(ack.ok, JSON.stringify(ack)).toBe(true)
    expect(ack.message.attachments).toHaveLength(1)
    expect(String(ack.message.attachments[0].upload)).toBe(idOf(upload))
    expect(ack.message.attachments[0].duration).toBe(12)
    expect(await received).not.toBeNull()

    const updated = await Upload.findById(upload._id).lean()
    expect(String(updated.attachedTo)).toBe(String(ack.message._id))
  })

  it('FILE-002: refuses an upload owned by another user', async () => {
    const foreign = await Upload.create({
      owner: idOf(bob.user),
      storageKey: 'qa/foreign.png',
      mimeType: 'image/png',
      size: 10,
    })
    const body = payload({ type: 'image', uploadIds: [idOf(foreign)] })
    const ack = await emitWithAck(aliceSocket, 'message:send', body)
    expect(ack.ok).toBe(false)
    expect(await Message.findOne({ clientId: body.clientId }).lean()).toBeNull()
    const unchanged = await Upload.findById(foreign._id).lean()
    expect(unchanged.attachedTo).toBeNull()
  })

  it('FILE-003: refuses an upload that is already attached', async () => {
    const existingMessage = await createMessage({ conversation, sender: alice.user, text: 'holder' })
    const used = await Upload.create({
      owner: idOf(alice.user),
      storageKey: 'qa/used.png',
      mimeType: 'image/png',
      size: 10,
      attachedTo: existingMessage._id,
    })
    const body = payload({ type: 'image', uploadIds: [idOf(used)] })
    const ack = await emitWithAck(aliceSocket, 'message:send', body)
    expect(ack.ok).toBe(false)
    expect(await Message.findOne({ clientId: body.clientId }).lean()).toBeNull()
  })

  it('FILE-002: refuses an unknown upload id', async () => {
    const body = payload({ type: 'image', uploadIds: [String(new mongoose.Types.ObjectId())] })
    const ack = await emitWithAck(aliceSocket, 'message:send', body)
    expect(ack.ok).toBe(false)
    expect(await Message.findOne({ clientId: body.clientId }).lean()).toBeNull()
  })

  it('BUG-021 / SEC-010: error acks use stable errors, not raw database messages', async () => {
    const foreign = await Upload.create({
      owner: idOf(bob.user),
      storageKey: 'qa/error-text.png',
      mimeType: 'image/png',
      size: 10,
    })
    const ack = await emitWithAck(aliceSocket, 'message:send', payload({
      type: 'image',
      uploadIds: [idOf(foreign)],
    }))
    expect(ack.ok).toBe(false)
    expect(ack.error).toBe('Invalid attachment')
    expect(String(ack.error)).not.toMatch(/Cast to ObjectId|for model|ValidationError|MongoServerError|at path/i)
  })

  it('CHAT-010: 100 sequential sends are all acked, unique, and ordered', async () => {
    const acks = []
    for (let index = 0; index < 100; index += 1) {
      const ack = await emitWithAck(aliceSocket, 'message:send', payload({
        text: `flood-${String(index).padStart(3, '0')}`,
        clientId: `flood-${index}-${randomUUID()}`,
      }))
      expect(ack.ok).toBe(true)
      acks.push(ack.message)
    }
    expect(new Set(acks.map((message) => message._id)).size).toBe(100)

    const stored = await Message.find({ conversation: idOf(conversation), text: /^flood-/ })
      .sort({ _id: 1 })
      .select('text')
      .lean()
    expect(stored.map((message) => message.text)).toEqual(
      Array.from({ length: 100 }, (_, index) => `flood-${String(index).padStart(3, '0')}`),
    )
  })

  it('SEC-010: a payload above maxHttpBufferSize is rejected without crashing the server', async () => {
    try {
      await emitWithAck(aliceSocket, 'message:send', payload({ text: 'x'.repeat(1_100_000) }), 2000)
    } catch {
      // Socket.IO closes the transport for an oversized packet; that is acceptable.
    }

    const health = await request(server.app).get('/api/health')
    expect(health.status).toBe(200)

    const fresh = (await connectReady(server.url, alice.token)).socket
    sockets.push(fresh)
    const ack = await emitWithAck(fresh, 'message:send', payload({ text: 'still alive' }))
    expect(ack.ok).toBe(true)
  })

  it.fails('BUG-022 / SEC-010: flooding message:send is rate-limited', async () => {
    const attempts = Array.from({ length: 50 }, (_, index) =>
      emitWithAck(aliceSocket, 'message:send', payload({ text: `burst-${index}` }), 3000),
    )
    const results = await Promise.allSettled(attempts)
    const rejected = results.filter((result) => result.status === 'fulfilled' && result.value?.ok === false)
    expect(rejected.length).toBeGreaterThan(0)
  })
})
