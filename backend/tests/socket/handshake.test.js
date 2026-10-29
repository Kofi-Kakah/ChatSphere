import { randomUUID } from 'node:crypto'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestDatabase } from '../helpers/db.js'
import { startTestServer } from '../helpers/server.js'
import { createDirectConversation, createUser, idOf } from '../helpers/factories.js'
import {
  connectReady,
  disconnectAll,
  drainPresenceGrace,
  emitWithAck,
  openSocket,
  recordEvents,
  waitForConnect,
  waitForEvent,
} from '../helpers/socket.js'

describe('socket handshake and server-controlled rooms', () => {
  let db
  let server
  let alice
  let bob
  let dave
  let conversation
  const sockets = []

  beforeAll(async () => {
    db = await startTestDatabase('socket-handshake')
    server = await startTestServer()
    alice = await createUser(server.config)
    bob = await createUser(server.config)
    dave = await createUser(server.config)
    conversation = await createDirectConversation(alice.user, bob.user)
  })

  afterAll(async () => {
    disconnectAll(sockets)
    await drainPresenceGrace()
    await server.stop()
    await db.stop()
  })

  async function ready(token) {
    const { socket } = await connectReady(server.url, token)
    sockets.push(socket)
    return socket
  }

  it('AUTH-020: rejects a handshake with no token', async () => {
    const socket = openSocket(server.url, undefined)
    sockets.push(socket)
    await expect(waitForConnect(socket, 3000)).rejects.toThrow(/unauthorized/i)
  })

  it('AUTH-020: rejects a handshake with a malformed token', async () => {
    const socket = openSocket(server.url, 'not-a-valid-jwt')
    sockets.push(socket)
    await expect(waitForConnect(socket, 3000)).rejects.toThrow(/unauthorized/i)
  })

  it('AUTH-020: rejects an expired access token', async () => {
    const expired = jwt.sign({ sub: String(alice.user._id) }, server.config.JWT_ACCESS_SECRET, { expiresIn: '-10s' })
    const socket = openSocket(server.url, expired)
    sockets.push(socket)
    await expect(waitForConnect(socket, 3000)).rejects.toThrow(/unauthorized/i)
  })

  it('AUTH-020: rejects a token signed with the wrong secret', async () => {
    const forged = jwt.sign({ sub: String(alice.user._id) }, 'wrong-secret', { expiresIn: '15m' })
    const socket = openSocket(server.url, forged)
    sockets.push(socket)
    await expect(waitForConnect(socket, 3000)).rejects.toThrow(/unauthorized/i)
  })

  it('AUTH-020 / PRES-005: a valid token connects and receives a presence snapshot', async () => {
    const { socket, snapshot } = await connectReady(server.url, bob.token)
    sockets.push(socket)
    expect(Array.isArray(snapshot.users)).toBe(true)
    expect(snapshot.users.some((entry) => entry.userId === String(alice.user._id))).toBe(true)
  })

  it('SEC-010: joining an arbitrary room has no effect; dave still receives nothing', async () => {
    const aliceSocket = await ready(alice.token)
    const bobSocket = await ready(bob.token)
    const daveSocket = await ready(dave.token)
    const daveWitness = recordEvents(daveSocket)
    sockets.push(aliceSocket, bobSocket, daveSocket)

    daveSocket.emit('join', `conv:${idOf(conversation)}`)
    daveSocket.emit('room:join', { room: `conv:${idOf(conversation)}` })

    const bobReceives = waitForEvent(bobSocket, 'message:new', {
      predicate: (payload) => payload?.message?.text === 'room isolation check',
    }).catch(() => null)
    const ack = await emitWithAck(aliceSocket, 'message:send', {
      conversationId: idOf(conversation),
      clientId: randomUUID(),
      type: 'text',
      text: 'room isolation check',
    })
    expect(ack.ok, JSON.stringify(ack)).toBe(true)
    expect(await bobReceives).not.toBeNull()

    expect(daveWitness.received('message:new')).toBe(false)
    expect(daveWitness.received('message:status')).toBe(false)
  })

  it('CHAT-016: dave cannot send to a conversation he is not in', async () => {
    const daveSocket = await ready(dave.token)
    const bobSocket = await ready(bob.token)
    const witness = recordEvents(bobSocket)
    sockets.push(daveSocket, bobSocket)

    const ack = await emitWithAck(daveSocket, 'message:send', {
      conversationId: idOf(conversation),
      clientId: randomUUID(),
      type: 'text',
      text: 'intrusion',
    })
    expect(ack?.ok).toBe(false)
    expect(witness.received('message:new')).toBe(false)
  })

  it('CHAT-014: reconnect rejoins conversation rooms and unseen history is available', async () => {
    const aliceFirst = await ready(alice.token)
    const bobSocket = await ready(bob.token)

    aliceFirst.disconnect()

    const missedOne = await emitWithAck(bobSocket, 'message:send', {
      conversationId: idOf(conversation),
      clientId: randomUUID(),
      type: 'text',
      text: 'missed while offline 1',
    })
    const missedTwo = await emitWithAck(bobSocket, 'message:send', {
      conversationId: idOf(conversation),
      clientId: randomUUID(),
      type: 'text',
      text: 'missed while offline 2',
    })
    expect(missedOne.ok).toBe(true)
    expect(missedTwo.ok).toBe(true)

    const aliceSecond = await ready(alice.token)
    const reconnectMessage = waitForEvent(aliceSecond, 'message:new', {
      predicate: (payload) => payload?.message?.text === 'after reconnect',
    }).catch(() => null)

    const afterReconnect = await emitWithAck(bobSocket, 'message:send', {
      conversationId: idOf(conversation),
      clientId: randomUUID(),
      type: 'text',
      text: 'after reconnect',
    })
    expect(afterReconnect.ok, JSON.stringify(afterReconnect)).toBe(true)

    const received = await reconnectMessage
    expect(received).not.toBeNull()
    expect(received.message.conversation).toBe(idOf(conversation))

    const history = await request(server.app)
      .get(`/api/conversations/${idOf(conversation)}/messages?limit=50`)
      .set(alice.header)
    expect(history.status).toBe(200)
    const texts = history.body.messages.map((message) => message.text)
    expect(texts).toContain('missed while offline 1')
    expect(texts).toContain('missed while offline 2')
    expect(texts).toContain('after reconnect')
  })
})
