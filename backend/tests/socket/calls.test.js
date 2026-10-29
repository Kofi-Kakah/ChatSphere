import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { startTestDatabase } from '../helpers/db.js'
import { startTestServer } from '../helpers/server.js'
import { createDirectConversation, createUser, idOf } from '../helpers/factories.js'
import { Message } from '../../src/models/Message.js'
import {
  connectReady,
  disconnectAll,
  drainPresenceGrace,
  emitAckOrNull,
  recordEvents,
  waitForEvent,
} from '../helpers/socket.js'

const RING_TIMEOUT_MS = 30_000

async function waitForCallLog(conversationId, status, timeout = 2000) {
  const started = Date.now()
  let latest = null
  while (Date.now() - started < timeout) {
    latest = await Message.findOne({ conversation: conversationId, type: 'call' })
      .sort({ createdAt: -1 })
      .lean()
    if (latest && (!status || latest.callInfo?.status === status)) return latest
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return latest
}

describe('call signaling', () => {
  let db
  let server
  let alice
  let bob
  let dave
  let eve
  let convAB
  let convAE
  let convDB
  let aliceSocket
  let bobSocket
  let daveSocket
  const sockets = []
  const witnesses = []

  beforeAll(async () => {
    db = await startTestDatabase('socket-calls')
    server = await startTestServer()
    alice = await createUser(server.config)
    bob = await createUser(server.config)
    dave = await createUser(server.config)
    eve = await createUser(server.config)
    convAB = await createDirectConversation(alice.user, bob.user)
    convAE = await createDirectConversation(alice.user, eve.user)
    convDB = await createDirectConversation(dave.user, bob.user)

    aliceSocket = (await connectReady(server.url, alice.token)).socket
    bobSocket = (await connectReady(server.url, bob.token)).socket
    daveSocket = (await connectReady(server.url, dave.token)).socket
    sockets.push(aliceSocket, bobSocket, daveSocket)
  })

  afterEach(() => {
    for (const witness of witnesses.splice(0)) witness.stop()
  })

  afterAll(async () => {
    disconnectAll(sockets)
    await drainPresenceGrace()
    await server.stop()
    await db.stop()
  })

  function witness(socket) {
    const recorder = recordEvents(socket)
    witnesses.push(recorder)
    return recorder
  }

  function next(socket, event, callId, timeout = 1500) {
    return waitForEvent(socket, event, {
      timeout,
      predicate: (payload) => payload?.callId === callId,
    }).catch(() => null)
  }

  function invite(socket, callId, overrides = {}, timeout = 1500) {
    return emitAckOrNull(socket, 'call:invite', {
      callId,
      conversationId: idOf(convAB),
      mode: 'video',
      ...overrides,
    }, timeout)
  }

  it.fails('BUG-017 / CALL-001: a video invite is acked and reaches the callee only', async () => {
    const callId = randomUUID()
    const daveWitness = witness(daveSocket)
    const incoming = next(bobSocket, 'call:incoming', callId)
    const ack = await invite(aliceSocket, callId)

    expect(ack).not.toBeNull()
    expect(ack?.ok).toBe(true)
    const payload = await incoming
    expect(payload).toMatchObject({ callId, conversationId: idOf(convAB), mode: 'video' })
    expect(daveWitness.received('call:incoming', (event) => event?.callId === callId)).toBe(false)
  })

  it.fails('BUG-017 / CALL-002: an audio-only call accepts and reaches the caller', async () => {
    const callId = randomUUID()
    const incoming = next(bobSocket, 'call:incoming', callId)
    const inviteAck = await invite(aliceSocket, callId, { mode: 'audio' })
    expect(inviteAck?.ok).toBe(true)
    const payload = await incoming
    expect(payload?.mode).toBe('audio')

    const accepted = next(aliceSocket, 'call:accepted', callId)
    const acceptAck = await emitAckOrNull(bobSocket, 'call:accept', { callId, conversationId: idOf(convAB) })
    expect(acceptAck?.ok).toBe(true)
    expect(await accepted).not.toBeNull()
  })

  it.fails('BUG-017 / CALL-003: a decline reaches the caller and logs a declined call', async () => {
    const callId = randomUUID()
    expect((await invite(aliceSocket, callId))?.ok).toBe(true)
    await next(bobSocket, 'call:incoming', callId)

    const declined = next(aliceSocket, 'call:declined', callId)
    const ack = await emitAckOrNull(bobSocket, 'call:decline', { callId, conversationId: idOf(convAB) })
    expect(ack?.ok).toBe(true)
    expect(await declined).not.toBeNull()
    const log = await waitForCallLog(idOf(convAB), 'declined')
    expect(log?.callInfo).toMatchObject({ mode: 'video', status: 'declined' })
  })

  it.fails('BUG-017 / CALL-004: a caller cancel stops the callee ring', async () => {
    const callId = randomUUID()
    expect((await invite(aliceSocket, callId))?.ok).toBe(true)
    await next(bobSocket, 'call:incoming', callId)

    const ended = next(bobSocket, 'call:ended', callId)
    const ack = await emitAckOrNull(aliceSocket, 'call:cancel', { callId, conversationId: idOf(convAB) })
    expect(ack?.ok).toBe(true)
    expect(await ended).not.toBeNull()
  })

  it.fails('BUG-017 + BUG-063 / CALL-005: an unanswered invite times out to missed after 30 s', async () => {
    const callId = randomUUID()
    const startedAt = Date.now()
    const inviteAck = await invite(aliceSocket, callId)
    expect(inviteAck?.ok).toBe(true)

    const ended = next(aliceSocket, 'call:ended', callId, RING_TIMEOUT_MS + 2000)
    expect(await ended).not.toBeNull()
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(RING_TIMEOUT_MS - 1000)
    const log = await waitForCallLog(idOf(convAB), 'missed')
    expect(log?.callInfo?.status).toBe('missed')
  })

  it.fails('BUG-017 + BUG-063 / CALL-006: an offline callee produces a missed call log', async () => {
    const callId = randomUUID()
    const ack = await invite(aliceSocket, callId, { conversationId: idOf(convAE) })
    expect(ack).not.toBeNull()
    expect(ack?.ok).toBe(true)
    expect(eve.user).toBeTruthy()

    const log = await waitForCallLog(idOf(convAE), 'missed')
    expect(log?.callInfo?.status).toBe('missed')
  })

  it.fails('BUG-017 + BUG-063 / CALL-007: ending a call notifies both sides and records the duration', async () => {
    const callId = randomUUID()
    expect((await invite(aliceSocket, callId))?.ok).toBe(true)
    await next(bobSocket, 'call:incoming', callId)
    expect((await emitAckOrNull(bobSocket, 'call:accept', { callId, conversationId: idOf(convAB) }))?.ok).toBe(true)

    const callerEnded = next(aliceSocket, 'call:ended', callId)
    const calleeEnded = next(bobSocket, 'call:ended', callId)
    const ack = await emitAckOrNull(bobSocket, 'call:end', { callId, conversationId: idOf(convAB) })
    expect(ack?.ok).toBe(true)
    expect(await callerEnded).not.toBeNull()
    expect(await calleeEnded).not.toBeNull()

    const log = await waitForCallLog(idOf(convAB), 'completed')
    expect(log?.callInfo).toMatchObject({ mode: 'video', status: 'completed' })
    expect(typeof log?.callInfo?.durationSec).toBe('number')
    expect(log.callInfo.durationSec).toBeGreaterThanOrEqual(0)
  })

  it.fails('BUG-017 / CALL-008: a second invite to a busy user is rejected as busy', async () => {
    const activeCall = randomUUID()
    expect((await invite(aliceSocket, activeCall))?.ok).toBe(true)
    await next(bobSocket, 'call:incoming', activeCall)
    expect((await emitAckOrNull(bobSocket, 'call:accept', { callId: activeCall, conversationId: idOf(convAB) }))?.ok).toBe(true)

    const daveWitness = witness(daveSocket)
    const secondCall = randomUUID()
    const busyAck = await invite(daveSocket, secondCall, { conversationId: idOf(convDB) })
    expect(busyAck).not.toBeNull()
    const rejected = busyAck?.ok === false && /busy/i.test(String(busyAck.error))
    expect(rejected || daveWitness.received('call:busy', (event) => event?.callId === secondCall)).toBe(true)
    expect(daveWitness.received('call:incoming')).toBe(false)

    await emitAckOrNull(aliceSocket, 'call:end', { callId: activeCall, conversationId: idOf(convAB) })
  })

  it.fails('BUG-017 / CALL-009: simultaneous invites resolve deterministically', async () => {
    const callA = randomUUID()
    const callB = randomUUID()
    const [ackA, ackB] = await Promise.all([
      invite(aliceSocket, callA),
      invite(bobSocket, callB),
    ])

    expect(ackA).not.toBeNull()
    expect(ackB).not.toBeNull()
    expect([ackA, ackB].filter((ack) => ack?.ok === true)).toHaveLength(1)
    expect(aliceSocket.connected).toBe(true)
    expect(bobSocket.connected).toBe(true)

    const winner = ackA?.ok ? callA : callB
    const winnerSocket = ackA?.ok ? aliceSocket : bobSocket
    await emitAckOrNull(winnerSocket, 'call:end', { callId: winner, conversationId: idOf(convAB) })
  })

  it.fails('BUG-017 / CALL-010: accepting on one device stops the ring on the other', async () => {
    const bobSecond = (await connectReady(server.url, bob.token)).socket
    sockets.push(bobSecond)

    const callId = randomUUID()
    const firstRing = next(bobSocket, 'call:incoming', callId)
    const secondRing = next(bobSecond, 'call:incoming', callId)
    expect((await invite(aliceSocket, callId))?.ok).toBe(true)
    expect(await firstRing).not.toBeNull()
    expect(await secondRing).not.toBeNull()

    const stopped = next(bobSecond, 'call:ended', callId)
    expect((await emitAckOrNull(bobSocket, 'call:accept', { callId, conversationId: idOf(convAB) }))?.ok).toBe(true)
    expect(await stopped).not.toBeNull()

    await emitAckOrNull(aliceSocket, 'call:end', { callId, conversationId: idOf(convAB) })
  })

  it.fails('BUG-017 / CALL-016: dave cannot accept, end, or signal another pair\'s call', async () => {
    const callId = randomUUID()
    expect((await invite(aliceSocket, callId))?.ok).toBe(true)
    await next(bobSocket, 'call:incoming', callId)
    expect((await emitAckOrNull(bobSocket, 'call:accept', { callId, conversationId: idOf(convAB) }))?.ok).toBe(true)

    const forged = {}
    for (const event of ['call:accept', 'call:end']) {
      forged[event] = await emitAckOrNull(daveSocket, event, { callId, conversationId: idOf(convAB) })
    }
    forged['call:signal'] = await emitAckOrNull(daveSocket, 'call:signal', {
      callId,
      conversationId: idOf(convAB),
      kind: 'offer',
      data: { type: 'offer', sdp: 'v=0' },
    })

    for (const [event, ack] of Object.entries(forged)) {
      expect(ack, `${event} was not acknowledged`).not.toBeNull()
      expect(ack.ok, `${event} was accepted from a non-participant`).toBe(false)
    }

    const relayed = next(aliceSocket, 'call:signal', callId)
    const legitimate = await emitAckOrNull(bobSocket, 'call:signal', {
      callId,
      conversationId: idOf(convAB),
      kind: 'answer',
      data: { type: 'answer', sdp: 'v=0' },
    })
    expect(legitimate?.ok).toBe(true)
    expect(await relayed).not.toBeNull()

    await emitAckOrNull(bobSocket, 'call:end', { callId, conversationId: idOf(convAB) })
  })

  it.fails('BUG-017 / CALL-016: unknown call ids are rejected', async () => {
    const unknown = randomUUID()
    const endAck = await emitAckOrNull(aliceSocket, 'call:end', { callId: unknown, conversationId: idOf(convAB) })
    const signalAck = await emitAckOrNull(aliceSocket, 'call:signal', {
      callId: unknown,
      conversationId: idOf(convAB),
      kind: 'offer',
      data: { type: 'offer', sdp: 'v=0' },
    })
    expect(endAck).not.toBeNull()
    expect(endAck?.ok).toBe(false)
    expect(signalAck).not.toBeNull()
    expect(signalAck?.ok).toBe(false)
  })

  it.fails('BUG-017 / CALL-016: forged sender fields are ignored on the invite', async () => {
    const callId = randomUUID()
    const incoming = next(bobSocket, 'call:incoming', callId)
    const ack = await invite(aliceSocket, callId, {
      callerId: idOf(dave.user),
      sender: idOf(dave.user),
      userId: idOf(dave.user),
    })
    expect(ack?.ok).toBe(true)

    const payload = await incoming
    expect(payload).not.toBeNull()
    expect(JSON.stringify(payload)).not.toContain(idOf(dave.user))
  })

  it.fails('BUG-017 / CALL-016: a non-member cannot invite into a conversation', async () => {
    const callId = randomUUID()
    const bobWitness = witness(bobSocket)
    const ack = await invite(daveSocket, callId)
    expect(ack).not.toBeNull()
    expect(ack?.ok).toBe(false)
    expect(bobWitness.received('call:incoming', (event) => event?.callId === callId)).toBe(false)
  })

  it.fails('BUG-017 / CALL-016: malformed invite payloads are rejected cleanly', async () => {
    const badConversation = await invite(aliceSocket, randomUUID(), { conversationId: 'not-an-id' })
    const badMode = await invite(aliceSocket, randomUUID(), { mode: 'hologram' })
    const missingCallId = await emitAckOrNull(aliceSocket, 'call:invite', {
      conversationId: idOf(convAB),
      mode: 'video',
    })

    for (const [label, ack] of Object.entries({ badConversation, badMode, missingCallId })) {
      expect(ack, `${label} was not acknowledged`).not.toBeNull()
      expect(ack.ok, `${label} was accepted`).toBe(false)
    }
    expect(aliceSocket.connected).toBe(true)
  })
})
