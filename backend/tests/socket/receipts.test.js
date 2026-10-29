import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestDatabase } from '../helpers/db.js'
import { startTestServer } from '../helpers/server.js'
import {
  createDirectConversation,
  createMessage,
  createUser,
  idOf,
} from '../helpers/factories.js'
import { Conversation } from '../../src/models/Conversation.js'
import { User } from '../../src/models/User.js'
import {
  connectReady,
  disconnectAll,
  drainPresenceGrace,
  emitAckOrNull,
  recordEvents,
  waitForEvent,
} from '../helpers/socket.js'

describe('message:delivered and message:read', () => {
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
  let m1
  let m2
  let m3
  let foreignMessage
  const sockets = []

  beforeAll(async () => {
    db = await startTestDatabase('socket-receipts')
    server = await startTestServer()
    alice = await createUser(server.config)
    bob = await createUser(server.config)
    dave = await createUser(server.config)
    conversation = await createDirectConversation(alice.user, bob.user)
    otherConversation = await createDirectConversation(alice.user, dave.user)

    m1 = await createMessage({ conversation, sender: alice.user, text: 'receipt one' })
    m2 = await createMessage({ conversation, sender: alice.user, text: 'receipt two' })
    m3 = await createMessage({ conversation, sender: alice.user, text: 'receipt three' })
    foreignMessage = await createMessage({ conversation: otherConversation, sender: dave.user, text: 'foreign' })

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

  async function participant(user) {
    const fresh = await Conversation.findById(conversation._id).lean()
    return fresh.participants.find((entry) => String(entry.user) === String(user.user._id))
  }

  function waitStatus(socket, userId, field, messageId) {
    return waitForEvent(socket, 'message:status', {
      timeout: 3000,
      predicate: (payload) =>
        payload?.userId === String(userId) &&
        (field ? String(payload[field]) === String(messageId) : true),
    }).catch(() => null)
  }

  it('REC-002: delivered updates the recipient pointer and broadcasts status', async () => {
    const aliceSees = waitStatus(aliceSocket, bob.user._id, 'lastDeliveredMessage', m2._id)
    bobSocket.emit('message:delivered', { conversationId: idOf(conversation), messageId: idOf(m2) })
    const event = await aliceSees
    expect(event).not.toBeNull()
    expect((await participant(bob)).lastDeliveredMessage).toEqual(m2._id)
  })

  it('REC-001/003: read updates the read pointer and broadcasts status', async () => {
    const aliceSees = waitStatus(aliceSocket, bob.user._id, 'lastReadMessage', m2._id)
    bobSocket.emit('message:read', { conversationId: idOf(conversation), messageId: idOf(m2) })
    const event = await aliceSees
    expect(event).not.toBeNull()
    expect((await participant(bob)).lastReadMessage).toEqual(m2._id)
  })

  it('REC-007: reading the same message twice is harmless', async () => {
    const aliceSees = waitStatus(aliceSocket, bob.user._id, 'lastReadMessage', m2._id)
    bobSocket.emit('message:read', { conversationId: idOf(conversation), messageId: idOf(m2) })
    expect(await aliceSees).not.toBeNull()
    expect((await participant(bob)).lastReadMessage).toEqual(m2._id)
  })

  it.fails('BUG-023 / REC-006: read pointers never move backwards', async () => {
    const newest = waitStatus(aliceSocket, bob.user._id, 'lastReadMessage', m3._id)
    bobSocket.emit('message:read', { conversationId: idOf(conversation), messageId: idOf(m3) })
    expect(await newest).not.toBeNull()

    const older = waitStatus(aliceSocket, bob.user._id, 'lastReadMessage', m1._id)
    bobSocket.emit('message:read', { conversationId: idOf(conversation), messageId: idOf(m1) })
    await older

    expect(String((await participant(bob)).lastReadMessage)).toBe(String(m3._id))
  })

  it.fails('BUG-023 / REC-006: delivered pointers never move backwards', async () => {
    const newest = waitStatus(aliceSocket, bob.user._id, 'lastDeliveredMessage', m3._id)
    bobSocket.emit('message:delivered', { conversationId: idOf(conversation), messageId: idOf(m3) })
    expect(await newest).not.toBeNull()

    const older = waitStatus(aliceSocket, bob.user._id, 'lastDeliveredMessage', m1._id)
    bobSocket.emit('message:delivered', { conversationId: idOf(conversation), messageId: idOf(m1) })
    await older

    expect(String((await participant(bob)).lastDeliveredMessage)).toBe(String(m3._id))
  })

  it.fails('BUG-023 / REC-008: dave cannot update pointers or emit a forged status', async () => {
    const before = await participant(bob)
    const forged = waitStatus(aliceSocket, dave.user._id, 'lastReadMessage', m1._id)
    daveSocket.emit('message:read', { conversationId: idOf(conversation), messageId: idOf(m1) })

    expect(await forged).toBeNull()
    const after = await participant(bob)
    expect(after.lastReadMessage).toEqual(before.lastReadMessage)

    const daveParticipant = await Conversation.findById(conversation._id).lean()
    expect(daveParticipant.participants.some((entry) => String(entry.user) === idOf(dave.user))).toBe(false)
  })

  it.fails('BUG-023 / REC-008: a message id from another conversation is rejected', async () => {
    const before = await participant(bob)
    const aliceSees = waitStatus(aliceSocket, bob.user._id, 'lastReadMessage', foreignMessage._id)
    bobSocket.emit('message:read', {
      conversationId: idOf(conversation),
      messageId: idOf(foreignMessage),
    })
    await aliceSees

    expect(String((await participant(bob)).lastReadMessage)).toBe(String(before.lastReadMessage))
  })

  it.fails('BUG-023 / REC-009: a user with read receipts off does not broadcast status', async () => {
    await User.updateOne({ _id: bob.user._id }, { 'privacy.sendReadReceipts': false })
    const witness = recordEvents(aliceSocket)
    const bobSelf = waitForEvent(bobSocket, 'message:status', {
      timeout: 1500,
      predicate: (payload) => payload?.userId === String(bob.user._id) && String(payload.lastReadMessage) === String(m3._id),
    }).catch(() => null)
    bobSocket.emit('message:read', { conversationId: idOf(conversation), messageId: idOf(m3) })
    await bobSelf

    expect(witness.received('message:status', (payload) => payload?.userId === String(bob.user._id))).toBe(false)
    witness.stop()
    await User.updateOne({ _id: bob.user._id }, { 'privacy.sendReadReceipts': true })
  })

  it.fails('BUG-024 / ACK: delivered and read are acknowledged', async () => {
    const delivered = await emitAckOrNull(bobSocket, 'message:delivered', {
      conversationId: idOf(conversation),
      messageId: idOf(m3),
    })
    const read = await emitAckOrNull(bobSocket, 'message:read', {
      conversationId: idOf(conversation),
      messageId: idOf(m3),
    })
    expect(delivered).not.toBeNull()
    expect(read).not.toBeNull()
  })
})
