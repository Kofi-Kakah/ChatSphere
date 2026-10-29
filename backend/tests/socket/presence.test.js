import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestDatabase } from '../helpers/db.js'
import { startTestServer } from '../helpers/server.js'
import { createDirectConversation, createUser, idOf } from '../helpers/factories.js'
import { User } from '../../src/models/User.js'
import {
  connectReady,
  disconnectAll,
  drainPresenceGrace,
  recordEvents,
  waitForEvent,
} from '../helpers/socket.js'

describe('presence', () => {
  let db
  let server
  let alice
  let bob
  let dave
  let gina
  let bobSocket
  let aliceFirstSocket
  let aliceSecondSocket
  const sockets = []

  beforeAll(async () => {
    db = await startTestDatabase('socket-presence')
    server = await startTestServer()
    alice = await createUser(server.config)
    bob = await createUser(server.config)
    dave = await createUser(server.config)
    gina = await createUser(server.config)
    await createDirectConversation(alice.user, bob.user)
    await createDirectConversation(bob.user, gina.user)

    bobSocket = (await connectReady(server.url, bob.token)).socket
    sockets.push(bobSocket)
  })

  afterAll(async () => {
    disconnectAll(sockets)
    await drainPresenceGrace()
    await server.stop()
    await db.stop()
  })

  async function ready(token) {
    const { socket, snapshot } = await connectReady(server.url, token)
    sockets.push(socket)
    return { socket, snapshot }
  }

  function onlineEvent(socket, user) {
    return waitForEvent(socket, 'presence:update', {
      timeout: 4000,
      predicate: (payload) => payload?.userId === String(user.user._id) && payload?.online === true,
    })
  }

  function offlineEvent(socket, user) {
    return waitForEvent(socket, 'presence:update', {
      timeout: 12_000,
      predicate: (payload) => payload?.userId === String(user.user._id) && payload?.online === false,
    }).catch(() => null)
  }

  it('PRES-001/005: a contact appears online in live updates and in the snapshot', async () => {
    const bobSees = onlineEvent(bobSocket, alice)
    const { socket, snapshot } = await ready(alice.token)
    aliceFirstSocket = socket
    const event = await bobSees
    expect(event).not.toBeNull()

    const bobEntry = snapshot.users.find((entry) => entry.userId === String(bob.user._id))
    expect(bobEntry).toMatchObject({ online: true })
  })

  it('PRES-002: multiple tabs count as one user and only the last tab going offline matters', async () => {
    const witness = recordEvents(bobSocket)

    aliceSecondSocket = (await ready(alice.token)).socket
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(witness.received('presence:update', (payload) => payload?.userId === String(alice.user._id) && payload?.online === true)).toBe(false)

    aliceFirstSocket.disconnect()
    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(witness.received('presence:update', (payload) => payload?.userId === String(alice.user._id) && payload?.online === false)).toBe(false)

    witness.stop()
  })

  it('PRES-003/004: the last tab going offline waits ~10 s, then stores and broadcasts lastSeenAt', async () => {
    const witness = recordEvents(bobSocket)
    const offline = offlineEvent(bobSocket, alice)
    aliceSecondSocket.disconnect()
    const startedAt = Date.now()
    const event = await offline
    const elapsed = Date.now() - startedAt

    expect(event).not.toBeNull()
    expect(elapsed).toBeGreaterThanOrEqual(9500)
    expect(elapsed).toBeLessThan(14_000)
    expect(event.lastSeenAt).toBeTruthy()

    const stored = await User.findById(alice.user._id).lean()
    expect(stored.lastSeenAt).toBeTruthy()
    expect(witness.received('presence:update', (payload) => payload?.userId === String(alice.user._id) && payload?.online === true)).toBe(false)
    witness.stop()
  })

  it('PRES-003: reconnecting inside the grace period produces no offline flicker', async () => {
    const aliceThird = (await ready(alice.token)).socket
    const witness = recordEvents(bobSocket)

    aliceThird.disconnect()
    await new Promise((resolve) => setTimeout(resolve, 300))
    const aliceFourth = (await ready(alice.token)).socket

    await new Promise((resolve) => setTimeout(resolve, 10_500))
    expect(witness.received('presence:update', (payload) => payload?.userId === String(alice.user._id) && payload?.online === false)).toBe(false)
    witness.stop()

    const aliceEntry = (await ready(bob.token)).snapshot.users.find((entry) => entry.userId === String(alice.user._id))
    expect(aliceEntry?.online).toBe(true)
    expect(aliceFourth.connected).toBe(true)
  })

  it.fails('BUG-018 / PRES-006: showOnlineStatus and showLastSeen are enforced in updates and snapshots', async () => {
    await User.updateOne({ _id: gina.user._id }, { 'privacy.showOnlineStatus': false, 'privacy.showLastSeen': false })
    const witness = recordEvents(bobSocket)

    const ginaSocket = (await ready(gina.token)).socket
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect.soft(witness.received('presence:update', (payload) => payload?.userId === String(gina.user._id) && payload?.online === true)).toBe(false)

    const bobSnapshot = (await ready(bob.token)).snapshot
    const ginaOnlineEntry = bobSnapshot.users.find((entry) => entry.userId === String(gina.user._id))
    expect.soft(ginaOnlineEntry?.online).toBe(false)
    expect.soft(ginaOnlineEntry?.lastSeenAt ?? null).toBeNull()

    ginaSocket.disconnect()
    const offline = await offlineEvent(bobSocket, gina)
    expect.soft(offline).not.toBeNull()
    expect.soft(offline?.lastSeenAt ?? null).toBeNull()

    const bobSnapshotAfter = (await ready(bob.token)).snapshot
    const ginaOfflineEntry = bobSnapshotAfter.users.find((entry) => entry.userId === String(gina.user._id))
    expect.soft(ginaOfflineEntry?.online).toBe(false)
    expect.soft(ginaOfflineEntry?.lastSeenAt ?? null).toBeNull()

    witness.stop()
    await User.updateOne({ _id: gina.user._id }, { 'privacy.showOnlineStatus': true, 'privacy.showLastSeen': true })
  })

  it.fails('BUG-018 / PRES-007: a non-contact does not receive live presence updates', async () => {
    const witness = recordEvents(bobSocket)
    const daveOnline = waitForEvent(bobSocket, 'presence:update', {
      timeout: 1500,
      predicate: (payload) => payload?.userId === String(dave.user._id) && payload?.online === true,
    }).catch(() => null)

    const daveSocket = (await ready(dave.token)).socket
    const event = await daveOnline

    expect(event).toBeNull()
    expect(witness.received('presence:update', (payload) => payload?.userId === String(dave.user._id))).toBe(false)

    witness.stop()
    daveSocket.disconnect()
  })

  it.fails('BUG-018 / PRES-005: the presence snapshot lists only contacts', async () => {
    const daveSocket = (await ready(dave.token)).socket
    const bobSnapshot = (await ready(bob.token)).snapshot
    expect(bobSnapshot.users.some((entry) => entry.userId === String(dave.user._id))).toBe(false)
    daveSocket.disconnect()
  })
})
