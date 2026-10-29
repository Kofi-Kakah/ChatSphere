import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { startTestDatabase } from '../helpers/db.js'
import { createTestApp } from '../helpers/server.js'
import { createUser, ensureIndexes } from '../helpers/factories.js'
import { Conversation } from '../../src/models/Conversation.js'

let db
let app
let config
let alice
let bob
let dave
let conversation

beforeAll(async () => {
  db = await startTestDatabase('api_notifications')
  ;({ app, config } = createTestApp())
  await ensureIndexes()
  ;[alice, bob, dave] = await Promise.all([
    createUser(config, { username: 'alice_notify', displayName: 'Alice' }),
    createUser(config, { username: 'bob_notify', displayName: 'Bob' }),
    createUser(config, { username: 'dave_notify', displayName: 'Dave' }),
  ])
  const created = await request(app)
    .post('/api/conversations/direct')
    .set(alice.header)
    .send({ userId: String(bob.user._id) })
  conversation = created.body.conversation
})

afterAll(async () => {
  await db.stop()
})

function participant(conversationBody, user) {
  return conversationBody.participants.find((p) => String(p.user) === String(user.user._id))
}

function patchMute(asUser, mutedUntil) {
  return request(app)
    .patch(`/api/conversations/${conversation._id}`)
    .set(asUser.header)
    .send({ mutedUntil })
}

async function storedMute(user) {
  const fresh = await Conversation.findById(conversation._id).lean()
  return fresh.participants.find((p) => String(p.user) === String(user.user._id)).mutedUntil
}

describe('REST notification mute state', () => {
  it.fails('MUTE-001 / BUG-078: a member can mute for one hour and the timestamp is stored for that participant', async () => {
    const target = Date.now() + 60 * 60 * 1000
    const response = await patchMute(alice, new Date(target).toISOString())

    expect(response.status).toBe(200)
    const muted = new Date(participant(response.body.conversation, alice).mutedUntil).getTime()
    expect(Math.abs(muted - target)).toBeLessThan(2000)

    const stored = await storedMute(alice)
    expect(new Date(stored).getTime()).toBe(muted)

    const list = await request(app).get('/api/conversations').set(alice.header)
    expect(list.status).toBe(200)
    const listed = list.body.conversations.find((c) => String(c._id) === String(conversation._id))
    expect(new Date(participant(listed, alice).mutedUntil).getTime()).toBe(muted)
  })

  it.fails('MUTE-002 / BUG-078: eight hours and until-unmuted round-trip through PATCH', async () => {
    const eightHours = Date.now() + 8 * 60 * 60 * 1000
    const mute = await patchMute(alice, new Date(eightHours).toISOString())
    expect(mute.status).toBe(200)
    expect(
      Math.abs(new Date(participant(mute.body.conversation, alice).mutedUntil).getTime() - eightHours),
    ).toBeLessThan(2000)

    const clear = await patchMute(alice, null)
    expect(clear.status).toBe(200)
    expect(participant(clear.body.conversation, alice).mutedUntil).toBeNull()
    expect(await storedMute(alice)).toBeNull()
  })

  it.fails('MUTE-003 / BUG-078: muting is per participant and leaves the other member unmuted', async () => {
    const target = Date.now() + 60 * 60 * 1000
    const mute = await patchMute(alice, new Date(target).toISOString())
    expect(mute.status).toBe(200)
    const muted = new Date(participant(mute.body.conversation, alice).mutedUntil).getTime()
    expect(Math.abs(muted - target)).toBeLessThan(2000)
    expect(new Date(await storedMute(alice)).getTime()).toBe(muted)

    const bobList = await request(app).get('/api/conversations').set(bob.header)
    const bobView = bobList.body.conversations.find((c) => String(c._id) === String(conversation._id))
    expect(participant(bobView, bob).mutedUntil).toBeNull()
    expect(await storedMute(bob)).toBeNull()
  })

  it.fails('MUTE-004 / BUG-078: an invalid mute timestamp is rejected with 400 instead of being ignored', async () => {
    const before = await storedMute(alice)
    const response = await patchMute(alice, 'not-a-date')
    expect(response.status).toBe(400)
    expect(await storedMute(alice)).toEqual(before)
  })

  it('MUTE-005: a non-member cannot mute or touch the conversation', async () => {
    const before = await storedMute(alice)
    const response = await patchMute(dave, new Date(Date.now() + 60 * 60 * 1000).toISOString())
    expect(response.status).toBe(403)
    expect(await storedMute(alice)).toEqual(before)
  })
})
