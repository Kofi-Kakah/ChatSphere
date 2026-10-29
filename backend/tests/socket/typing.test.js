import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestDatabase } from '../helpers/db.js'
import { startTestServer } from '../helpers/server.js'
import { createDirectConversation, createUser, idOf } from '../helpers/factories.js'
import { Conversation } from '../../src/models/Conversation.js'
import { Message } from '../../src/models/Message.js'
import {
  connectReady,
  disconnectAll,
  drainPresenceGrace,
  emitAckOrNull,
  recordEvents,
  waitForEvent,
} from '../helpers/socket.js'

describe('typing indicators', () => {
  let db
  let server
  let alice
  let bob
  let dave
  let conversation
  let otherConversation
  let aliceSocket
  let bobSocket
  let daveSocket
  const sockets = []

  beforeAll(async () => {
    db = await startTestDatabase('socket-typing')
    server = await startTestServer()
    alice = await createUser(server.config)
    bob = await createUser(server.config)
    dave = await createUser(server.config)
    conversation = await createDirectConversation(alice.user, bob.user)
    otherConversation = await createDirectConversation(alice.user, dave.user)

    aliceSocket = (await connectReady(server.url, alice.token)).socket
    bobSocket = (await connectReady(server.url, bob.token)).socket
    daveSocket = (await connectReady(server.url, dave.token)).socket
    sockets.push(aliceSocket, bobSocket, daveSocket)
  })

  afterAll(async () => {
    disconnectAll(sockets)
    await drainPresenceGrace()
    await server.stop()
    await db.stop()
  })

  function typingEvent(socket, expected, isTyping) {
    return waitForEvent(socket, 'typing:update', {
      timeout: 3000,
      predicate: (payload) =>
        payload?.userId === String(expected.user._id) &&
        payload?.conversationId === idOf(conversation) &&
        payload?.isTyping === isTyping,
    }).catch(() => null)
  }

  it('TYP-001: start and stop reach the other member', async () => {
    const started = typingEvent(bobSocket, alice, true)
    aliceSocket.emit('typing:start', { conversationId: idOf(conversation) })
    const startEvent = await started
    expect(startEvent).not.toBeNull()

    const stopped = typingEvent(bobSocket, alice, false)
    aliceSocket.emit('typing:stop', { conversationId: idOf(conversation) })
    const stopEvent = await stopped
    expect(stopEvent).not.toBeNull()
  })

  it('TYP-006: typing is scoped to the conversation', async () => {
    const bobWitness = recordEvents(bobSocket)
    const daveWitness = recordEvents(daveSocket)

    const bobSees = typingEvent(bobSocket, alice, true)
    aliceSocket.emit('typing:start', { conversationId: idOf(conversation) })
    expect(await bobSees).not.toBeNull()

    expect(bobWitness.received('typing:update')).toBe(true)
    expect(daveWitness.received('typing:update')).toBe(false)
    bobWitness.stop()
    daveWitness.stop()

    aliceSocket.emit('typing:stop', { conversationId: idOf(conversation) })
  })

  it('TYP-008: a non-member cannot emit typing into someone else’s conversation', async () => {
    const bobWitness = recordEvents(bobSocket)
    const aliceWitness = recordEvents(aliceSocket)
    daveSocket.emit('typing:start', { conversationId: idOf(conversation) })

    // A membership rejection produces no event at all; nothing to await, so
    // give the server one event-loop turn plus the normal delivery window.
    await typingEvent(bobSocket, dave, true)

    expect(bobWitness.received('typing:update', (payload) => payload?.userId === String(dave.user._id))).toBe(false)
    expect(aliceWitness.received('typing:update', (payload) => payload?.userId === String(dave.user._id))).toBe(false)
    bobWitness.stop()
    aliceWitness.stop()
  })

  it('TYP-005: typing is ephemeral and never persisted', async () => {
    const beforeMessages = await Message.countDocuments({ conversation: idOf(conversation) })
    const beforeConversation = await Conversation.findById(conversation._id).lean()
    const bobSees = typingEvent(bobSocket, alice, true)
    aliceSocket.emit('typing:start', { conversationId: idOf(conversation) })
    expect(await bobSees).not.toBeNull()
    aliceSocket.emit('typing:stop', { conversationId: idOf(conversation) })

    const afterMessages = await Message.countDocuments({ conversation: idOf(conversation) })
    const afterConversation = await Conversation.findById(conversation._id).lean()
    expect(afterMessages).toBe(beforeMessages)
    expect(afterConversation.updatedAt).toEqual(beforeConversation.updatedAt)
  })

  it('TYP-008: an unknown conversation produces no typing event', async () => {
    const unknownId = String(new mongoose.Types.ObjectId())
    const witness = recordEvents(bobSocket)
    aliceSocket.emit('typing:start', { conversationId: unknownId })
    aliceSocket.emit('typing:stop', { conversationId: unknownId })

    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(witness.received('typing:update', (payload) => payload?.conversationId === unknownId)).toBe(false)
    witness.stop()
  })

  it.fails('BUG-024 / ACK: typing:start and typing:stop are acknowledged', async () => {
    const startAck = await emitAckOrNull(aliceSocket, 'typing:start', { conversationId: idOf(conversation) })
    const stopAck = await emitAckOrNull(aliceSocket, 'typing:stop', { conversationId: idOf(conversation) })
    expect(startAck).not.toBeNull()
    expect(stopAck).not.toBeNull()
  })
})
