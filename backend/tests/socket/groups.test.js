import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestDatabase } from '../helpers/db.js'
import { startTestServer } from '../helpers/server.js'
import { createGroupConversation, createUser, idOf } from '../helpers/factories.js'
import {
  connectReady,
  disconnectAll,
  drainPresenceGrace,
  emitWithAck,
  recordEvents,
  waitForEvent,
} from '../helpers/socket.js'

describe('group socket rooms and lifecycle events', () => {
  let db
  let server
  let alice
  let bob
  let carol
  let dave
  let group
  let aliceSocket
  let bobSocket
  let carolSocket
  let daveSocket
  const sockets = []

  beforeAll(async () => {
    db = await startTestDatabase('socket-groups')
    server = await startTestServer()
    alice = await createUser(server.config)
    bob = await createUser(server.config)
    carol = await createUser(server.config)
    dave = await createUser(server.config)
    group = await createGroupConversation({ creator: alice.user, members: [bob.user, carol.user], name: 'Socket Group' })

    aliceSocket = (await connectReady(server.url, alice.token)).socket
    bobSocket = (await connectReady(server.url, bob.token)).socket
    carolSocket = (await connectReady(server.url, carol.token)).socket
    daveSocket = (await connectReady(server.url, dave.token)).socket
    sockets.push(aliceSocket, bobSocket, carolSocket, daveSocket)
  })

  afterAll(async () => {
    disconnectAll(sockets)
    await drainPresenceGrace()
    await server.stop()
    await db.stop()
  })

  function groupMessage(overrides = {}) {
    return {
      conversationId: idOf(group),
      clientId: randomUUID(),
      type: 'text',
      text: 'group hello',
      ...overrides,
    }
  }

  async function sendAndWaitFor(socket, body, recipient) {
    const received = waitForEvent(recipient, 'message:new', {
      predicate: (event) => event?.message?.clientId === body.clientId,
    }).catch(() => null)
    const ack = await emitWithAck(socket, 'message:send', body)
    expect(ack.ok, JSON.stringify(ack)).toBe(true)
    return received
  }

  it('GRP-012: dave never receives group traffic before being added', async () => {
    const witness = recordEvents(daveSocket)
    const body = groupMessage({ text: 'members only' })
    const bobReceives = await sendAndWaitFor(aliceSocket, body, bobSocket)
    expect(bobReceives).not.toBeNull()
    expect(witness.received('message:new')).toBe(false)
    witness.stop()
  })

  it.fails('BUG-015 / GRP-005: a removed member stops receiving live events immediately', async () => {
    const removal = await request(server.app)
      .delete(`/api/conversations/${idOf(group)}/members/${idOf(bob.user)}`)
      .set(alice.header)
    expect(removal.status).toBe(200)

    const witness = recordEvents(bobSocket)
    const body = groupMessage({ text: 'after removal' })
    const carolReceives = await sendAndWaitFor(aliceSocket, body, carolSocket)
    expect(carolReceives).not.toBeNull()

    expect(witness.received('message:new')).toBe(false)
    witness.stop()
  })

  it('GRP-005: a removed member cannot send into the group', async () => {
    const ack = await emitWithAck(bobSocket, 'message:send', groupMessage({ text: 'removed send' }))
    expect(ack.ok).toBe(false)
  })

  it('GRP-005: a removed member cannot emit typing into the group', async () => {
    const witness = recordEvents(carolSocket)
    bobSocket.emit('typing:start', { conversationId: idOf(group) })
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(witness.received('typing:update', (payload) => payload?.userId === String(bob.user._id))).toBe(false)
    witness.stop()
  })

  it.fails('BUG-015 / GRP-015: a newly added member starts receiving live events without reconnecting', async () => {
    const addition = await request(server.app)
      .post(`/api/conversations/${idOf(group)}/members`)
      .set(alice.header)
      .send({ userIds: [idOf(dave.user)] })
    expect(addition.status).toBe(200)

    const body = groupMessage({ text: 'welcome dave' })
    const daveReceives = waitForEvent(daveSocket, 'message:new', {
      predicate: (event) => event?.message?.clientId === body.clientId,
      timeout: 2000,
    }).catch(() => null)
    const carolReceives = waitForEvent(carolSocket, 'message:new', {
      predicate: (event) => event?.message?.clientId === body.clientId,
    })
    const ack = await emitWithAck(aliceSocket, 'message:send', body)
    expect(ack.ok).toBe(true)
    expect(await carolReceives).not.toBeNull()
    expect(await daveReceives).not.toBeNull()
  })

  it.fails('BUG-016 / GRP-014: members are told when the group is renamed or re-themed', async () => {
    const updated = waitForEvent(carolSocket, 'conversation:updated', {
      timeout: 1500,
      predicate: (payload) => idOf(payload?.conversation ?? payload) === idOf(group),
    }).catch(() => null)
    const patch = await request(server.app)
      .patch(`/api/conversations/${idOf(group)}`)
      .set(alice.header)
      .send({ name: 'Renamed Group' })
    expect(patch.status).toBe(200)
    expect(await updated).not.toBeNull()
  })

  it.fails('BUG-016 / GRP-014: members are told when a group is created', async () => {
    const created = waitForEvent(carolSocket, 'conversation:created', { timeout: 1500 }).catch(() => null)
    const response = await request(server.app)
      .post('/api/conversations/group')
      .set(alice.header)
      .send({ name: 'Live Created Group', memberIds: [idOf(bob.user), idOf(carol.user)] })
    expect(response.status).toBe(201)
    expect(await created).not.toBeNull()
  })

  it.fails('BUG-016 / GRP-014: members are told when a member leaves', async () => {
    const removed = waitForEvent(aliceSocket, 'conversation:removed', {
      timeout: 1500,
      predicate: (payload) => idOf(payload?.conversationId ?? payload) === idOf(group),
    }).catch(() => null)
    const leave = await request(server.app)
      .post(`/api/conversations/${idOf(group)}/leave`)
      .set(carol.header)
    expect(leave.status).toBe(200)
    expect(await removed).not.toBeNull()
  })
})
