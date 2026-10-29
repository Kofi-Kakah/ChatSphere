import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestDatabase } from '../helpers/db.js'
import { startTestServer } from '../helpers/server.js'
import { createDirectConversation, createUser, idOf } from '../helpers/factories.js'
import {
  connectReady,
  disconnectAll,
  drainPresenceGrace,
  emitAckOrNull,
} from '../helpers/socket.js'

describe('conversation:active and call signaling events', () => {
  let db
  let server
  let alice
  let bob
  let conversation
  let aliceSocket
  let bobSocket
  const sockets = []

  beforeAll(async () => {
    db = await startTestDatabase('socket-events')
    server = await startTestServer()
    alice = await createUser(server.config)
    bob = await createUser(server.config)
    conversation = await createDirectConversation(alice.user, bob.user)
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

  it.fails('BUG-016 / SOCK-ACTIVE: conversation:active is accepted and acknowledged', async () => {
    const ack = await emitAckOrNull(aliceSocket, 'conversation:active', {
      conversationId: idOf(conversation),
    })
    expect(ack).not.toBeNull()
    expect(ack?.ok).toBe(true)
  })

  it.fails('BUG-017 / CALL-001: call:invite reaches the callee and is acknowledged', async () => {
    const callId = randomUUID()
    const incoming = new Promise((resolve) => {
      const timer = setTimeout(() => {
        bobSocket.off('call:incoming', handler)
        resolve(null)
      }, 1200)
      function handler(payload) {
        if (payload?.callId !== callId) return
        clearTimeout(timer)
        bobSocket.off('call:incoming', handler)
        resolve(payload)
      }
      bobSocket.on('call:incoming', handler)
    })

    const ack = await emitAckOrNull(aliceSocket, 'call:invite', {
      callId,
      conversationId: idOf(conversation),
      mode: 'video',
    }, 1200)
    expect(ack).not.toBeNull()
    expect(ack?.ok).toBe(true)
    expect(await incoming).not.toBeNull()
  })

  it.fails('BUG-017 / CALL-001: accept, decline, cancel, end, and signal are acknowledged', async () => {
    const callId = randomUUID()
    const payload = { callId, conversationId: idOf(conversation) }
    const acks = {}
    for (const event of ['call:accept', 'call:decline', 'call:cancel', 'call:end']) {
      acks[event] = await emitAckOrNull(bobSocket, event, payload, 600)
    }
    acks['call:signal'] = await emitAckOrNull(bobSocket, 'call:signal', {
      ...payload,
      kind: 'offer',
      data: { type: 'offer', sdp: 'v=0' },
    }, 600)

    for (const [event, ack] of Object.entries(acks)) {
      expect(ack, `${event} was not acknowledged`).not.toBeNull()
    }
  })
})
