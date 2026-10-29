import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestDatabase } from '../helpers/db.js'
import { startTestServer } from '../helpers/server.js'
import {
  createDirectConversation,
  createUser,
  idOf,
} from '../helpers/factories.js'
import { Conversation } from '../../src/models/Conversation.js'
import { Message } from '../../src/models/Message.js'
import {
  connectReady,
  connectSocket,
  disconnectAll,
  drainPresenceGrace,
  emitWithAck,
  recordEvents,
  waitForEvent,
} from '../helpers/socket.js'

// Testing.md 6.1: every socket event is exercised as dave (authenticated
// non-member) with alice/bob as the "must not receive" witnesses.

let db
let server
let alice
let bob
let dave
let eve
let aliceBob
let daveEve
let aliceSocket
let bobSocket
let daveSocket
let eveSocket
const sockets = []

beforeAll(async () => {
  db = await startTestDatabase('security_socket_authz')
  server = await startTestServer()
  ;[alice, bob, dave, eve] = await Promise.all([
    createUser(server.config, { username: 'alice_sec' }),
    createUser(server.config, { username: 'bob_sec' }),
    createUser(server.config, { username: 'dave_sec' }),
    createUser(server.config, { username: 'eve_sec' }),
  ])
  aliceBob = await createDirectConversation(alice.user, bob.user)
  daveEve = await createDirectConversation(dave.user, eve.user)
  aliceSocket = (await connectReady(server.url, alice.token)).socket
  bobSocket = (await connectReady(server.url, bob.token)).socket
  daveSocket = (await connectReady(server.url, dave.token)).socket
  eveSocket = (await connectReady(server.url, eve.token)).socket
  sockets.push(aliceSocket, bobSocket, daveSocket, eveSocket)
})

afterAll(async () => {
  disconnectAll(sockets)
  await drainPresenceGrace()
  await server.stop()
  await db.stop()
})

function send(socket, conversationId, text, overrides = {}) {
  return emitWithAck(socket, 'message:send', {
    conversationId: String(conversationId),
    clientId: crypto.randomUUID(),
    type: 'text',
    text,
    ...overrides,
  })
}

async function participantsOf(conversationId) {
  const fresh = await Conversation.findById(conversationId).lean()
  return fresh.participants
}

describe('socket authorization matrix', () => {
  it('SOCK-AUTHZ-001: dave cannot send, type, or write receipts into another pair’s conversation', async () => {
    const aliceEvents = recordEvents(aliceSocket)
    const bobEvents = recordEvents(bobSocket)
    const before = await participantsOf(aliceBob._id)

    const seed = await send(aliceSocket, aliceBob._id, 'authorized seed')
    expect(seed.ok).toBe(true)
    const seedId = seed.message._id

    daveSocket.emit('typing:start', { conversationId: String(aliceBob._id), userId: String(bob.user._id) })
    daveSocket.emit('typing:stop', { conversationId: String(aliceBob._id) })
    daveSocket.emit('message:delivered', {
      conversationId: String(aliceBob._id),
      messageId: String(seedId),
      userId: String(bob.user._id),
    })
    daveSocket.emit('message:read', {
      conversationId: String(aliceBob._id),
      messageId: String(seedId),
      userId: String(bob.user._id),
    })
    const intrusion = await send(daveSocket, aliceBob._id, 'dave intrusion')
    expect(intrusion.ok).toBe(false)

    const marker = await send(aliceSocket, aliceBob._id, 'authorized marker')
    expect(marker.ok).toBe(true)

    const daveId = String(dave.user._id)
    expect(aliceEvents.all('message:new').some((payload) => payload?.message?.text === 'dave intrusion')).toBe(false)
    expect(bobEvents.all('message:new').some((payload) => payload?.message?.text === 'dave intrusion')).toBe(false)
    expect(aliceEvents.all('typing:update').some((payload) => payload?.userId === daveId)).toBe(false)
    expect(bobEvents.all('typing:update').some((payload) => payload?.userId === daveId)).toBe(false)
    expect(await Message.countDocuments({ conversation: aliceBob._id, text: 'dave intrusion' })).toBe(0)

    const after = await participantsOf(aliceBob._id)
    const pointer = (participants, userId, field) =>
      String(participants.find((entry) => String(entry.user) === userId)?.[field] ?? '')
    for (const user of [alice, bob]) {
      expect(pointer(after, idOf(user.user), 'lastDeliveredMessage')).toBe(
        pointer(before, idOf(user.user), 'lastDeliveredMessage'),
      )
      expect(pointer(after, idOf(user.user), 'lastReadMessage')).toBe(
        pointer(before, idOf(user.user), 'lastReadMessage'),
      )
    }

    aliceEvents.stop()
    bobEvents.stop()
  })

  it.fails('SOCK-AUTHZ-001b / BUG-023: dave cannot forge receipt status broadcasts into another pair’s room', async () => {
    const aliceEvents = recordEvents(aliceSocket)
    const bobEvents = recordEvents(bobSocket)
    const seed = await send(aliceSocket, aliceBob._id, 'status seed')
    expect(seed.ok).toBe(true)

    daveSocket.emit('message:delivered', {
      conversationId: String(aliceBob._id),
      messageId: String(seed.message._id),
      userId: String(bob.user._id),
    })
    daveSocket.emit('message:read', {
      conversationId: String(aliceBob._id),
      messageId: String(seed.message._id),
      userId: String(bob.user._id),
    })
    const marker = await send(aliceSocket, aliceBob._id, 'status marker')
    expect(marker.ok).toBe(true)

    const daveId = String(dave.user._id)
    const forgedAtAlice = aliceEvents.all('message:status').filter((payload) => payload?.userId === daveId)
    const forgedAtBob = bobEvents.all('message:status').filter((payload) => payload?.userId === daveId)
    console.log(`[authz] forged status broadcasts alice=${forgedAtAlice.length} bob=${forgedAtBob.length}`)
    aliceEvents.stop()
    bobEvents.stop()
    expect(forgedAtAlice).toHaveLength(0)
    expect(forgedAtBob).toHaveLength(0)
  })

  it('SOCK-AUTHZ-002: forged userId fields never change the authenticated sender or pointers', async () => {
    const eveEvents = recordEvents(eveSocket)
    const eveSeed = await send(eveSocket, daveEve._id, 'from eve')
    expect(eveSeed.ok).toBe(true)

    const spoof = await emitWithAck(daveSocket, 'message:send', {
      conversationId: String(daveEve._id),
      clientId: crypto.randomUUID(),
      type: 'text',
      text: 'spoofed sender',
      userId: String(eve.user._id),
      sender: String(eve.user._id),
    })
    expect(spoof.ok).toBe(true)
    expect(String(spoof.message.sender)).toBe(String(dave.user._id))
    const stored = await Message.findById(spoof.message._id).lean()
    expect(String(stored.sender)).toBe(String(dave.user._id))

    daveSocket.emit('message:read', {
      conversationId: String(daveEve._id),
      messageId: String(eveSeed.message._id),
      userId: String(eve.user._id),
    })
    const marker = await send(daveSocket, daveEve._id, 'after spoof')
    expect(marker.ok).toBe(true)
    await waitForEvent(eveSocket, 'message:new', {
      predicate: (payload) => payload?.message?.text === 'after spoof',
    })

    const participants = await participantsOf(daveEve._id)
    const evePart = participants.find((entry) => String(entry.user) === String(eve.user._id))
    expect(evePart.lastReadMessage).toBeNull()
    expect(evePart.lastDeliveredMessage).toBeNull()
    expect(
      eveEvents.all('message:status').some((payload) => payload?.userId === String(eve.user._id)),
    ).toBe(false)
    eveEvents.stop()
  })

  it('SOCK-AUTHZ-003: arbitrary room joins from dave are ignored', async () => {
    const daveEvents = recordEvents(daveSocket)
    daveSocket.emit('join', `conv:${aliceBob._id}`)
    daveSocket.emit('conversation:join', { conversationId: String(aliceBob._id) })
    daveSocket.emit('room:join', { room: `user:${alice.user._id}` })

    const marker = await send(aliceSocket, aliceBob._id, 'room isolation marker')
    expect(marker.ok).toBe(true)
    await waitForEvent(bobSocket, 'message:new', {
      predicate: (payload) => payload?.message?.text === 'room isolation marker',
    })

    expect(daveEvents.all('message:new')).toHaveLength(0)
    daveEvents.stop()
  })

  it('SOCK-AUTHZ-004: 40 rapid connect/disconnect cycles do not break delivery for established sockets', async () => {
    for (let cycle = 0; cycle < 40; cycle += 1) {
      const socket = await connectSocket(server.url, dave.token)
      socket.disconnect()
    }

    const daveEvents = recordEvents(daveSocket)
    const marker = await send(aliceSocket, aliceBob._id, 'after rapid cycles')
    expect(marker.ok).toBe(true)
    await waitForEvent(bobSocket, 'message:new', {
      predicate: (payload) => payload?.message?.text === 'after rapid cycles',
    })
    expect(daveEvents.all('message:new')).toHaveLength(0)
    daveEvents.stop()

    const reconnected = await connectReady(server.url, dave.token)
    sockets.push(reconnected.socket)
    const after = await send(reconnected.socket, daveEve._id, 'dave still works')
    expect(after.ok).toBe(true)
    reconnected.socket.disconnect()
  })

  it.fails('SOCK-AUTHZ-005 / BUG-084: presence goes offline after rapid connect/disconnect cycles', async () => {
    eveSocket.disconnect()
    for (let cycle = 0; cycle < 40; cycle += 1) {
      const socket = await connectSocket(server.url, eve.token)
      socket.disconnect()
    }

    const clean = await connectReady(server.url, eve.token)
    sockets.push(clean.socket)
    clean.socket.disconnect()

    const offlineSeen = await waitForEvent(aliceSocket, 'presence:update', {
      timeout: 12000,
      predicate: (payload) => payload?.userId === String(eve.user._id) && payload?.online === false,
    })
      .then(() => true)
      .catch(() => false)
    console.log(`[authz] eve offline presence after rapid cycles: ${offlineSeen}`)
    expect(offlineSeen).toBe(true)
  })

  it.fails('SOCK-AUTHZ-006 / BUG-085: an event emitted immediately after connect is acknowledged', async () => {
    let answered = 0
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const socket = await connectSocket(server.url, dave.token)
      try {
        const result = await emitWithAck(socket, 'message:send', {
          conversationId: String(daveEve._id),
          clientId: crypto.randomUUID(),
          type: 'text',
          text: `early emit ${attempt}`,
        }, 1500)
        if (result.ok) answered += 1
      } catch (error) {
        console.log(`[authz] early emit ${attempt} dropped: ${error.message}`)
      }
      socket.disconnect()
    }
    expect(answered).toBe(5)
  })

  it.fails('SOCK-AUTHZ-007 / BUG-083: users cannot forge system or call-log message types', async () => {
    const system = await send(aliceSocket, aliceBob._id, 'Alice changed the theme to Love', { type: 'system' })
    const call = await send(aliceSocket, aliceBob._id, 'Missed video call', { type: 'call' })
    console.log(`[authz] forged types: system=${system.ok} call=${call.ok}`)

    expect(system.ok).toBe(false)
    expect(call.ok).toBe(false)
    expect(await Message.countDocuments({ conversation: aliceBob._id, type: 'system', text: 'Alice changed the theme to Love' })).toBe(0)
    expect(await Message.countDocuments({ conversation: aliceBob._id, type: 'call', text: 'Missed video call' })).toBe(0)
  })
})
