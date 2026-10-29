import { randomUUID } from 'node:crypto'
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

describe('message:send with uploads', () => {
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
    db = await startTestDatabase('socket-attachments')
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
      type: 'image',
      text: '',
      ...overrides,
    }
  }

  async function uploadDoc(owner, overrides = {}) {
    return Upload.create({
      owner: idOf(owner.user),
      storageKey: 'qa/attachment.png',
      mimeType: 'image/png',
      size: 128,
      originalName: 'attachment.png',
      width: 10,
      height: 10,
      ...overrides,
    })
  }

  it('FILE-001: an owned upload is attached, delivered to Bob, and never sent to Dave', async () => {
    const upload = await uploadDoc(alice)
    const body = payload({ uploadIds: [idOf(upload)] })
    const daveWitness = recordEvents(daveSocket)
    const received = waitForEvent(bobSocket, 'message:new', {
      predicate: (event) => event?.message?.clientId === body.clientId,
    }).catch(() => null)

    const ack = await emitWithAck(aliceSocket, 'message:send', body)

    expect(ack.ok, JSON.stringify(ack)).toBe(true)
    expect(ack.message.attachments).toHaveLength(1)
    expect(String(ack.message.attachments[0].upload)).toBe(idOf(upload))
    const delivered = await received
    expect(delivered).not.toBeNull()
    expect(daveWitness.all('message:new')).toHaveLength(0)
    daveWitness.stop()

    const stored = await Upload.findById(upload._id).lean()
    expect(String(stored.attachedTo)).toBe(String(ack.message._id))
  })

  it('FILE-002: refuses another user\'s upload and leaves it unattached', async () => {
    const foreign = await uploadDoc(dave)
    const body = payload({ uploadIds: [idOf(foreign)] })

    const ack = await emitWithAck(aliceSocket, 'message:send', body)

    expect(ack.ok).toBe(false)
    expect(await Message.findOne({ clientId: body.clientId }).lean()).toBeNull()
    const unchanged = await Upload.findById(foreign._id).lean()
    expect(unchanged.attachedTo).toBeNull()
  })

  it('FILE-002: refuses a valid + foreign upload list without creating a message', async () => {
    const owned = await uploadDoc(alice)
    const foreign = await uploadDoc(dave)
    const body = payload({ uploadIds: [idOf(owned), idOf(foreign)] })

    const ack = await emitWithAck(aliceSocket, 'message:send', body)

    expect(ack.ok).toBe(false)
    expect(await Message.findOne({ clientId: body.clientId }).lean()).toBeNull()
    expect((await Upload.findById(owned._id).lean()).attachedTo).toBeNull()
    expect((await Upload.findById(foreign._id).lean()).attachedTo).toBeNull()
  })

  it('FILE-003: refuses an upload that is already attached to a message', async () => {
    const existing = await createMessage({ conversation, sender: alice.user, text: 'holder' })
    const used = await uploadDoc(alice, { attachedTo: existing._id })
    const body = payload({ uploadIds: [idOf(used)] })

    const ack = await emitWithAck(aliceSocket, 'message:send', body)

    expect(ack.ok).toBe(false)
    expect(await Message.findOne({ clientId: body.clientId }).lean()).toBeNull()
    expect(String((await Upload.findById(used._id).lean()).attachedTo)).toBe(String(existing._id))
  })

  it('FILE-002: refuses an unknown upload id', async () => {
    const body = payload({ uploadIds: [String(new mongoose.Types.ObjectId())] })

    const ack = await emitWithAck(aliceSocket, 'message:send', body)

    expect(ack.ok).toBe(false)
    expect(await Message.findOne({ clientId: body.clientId }).lean()).toBeNull()
  })
})
