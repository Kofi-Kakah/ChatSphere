import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestDatabase } from '../helpers/db.js'
import {
  createDirectConversation,
  createMessage,
  createUser,
  ensureIndexes,
} from '../helpers/factories.js'
import { makeTestConfig } from '../helpers/config.js'
import { Upload } from '../../src/models/Upload.js'

const DAY_MS = 24 * 60 * 60 * 1000

describe('Upload TTL and attached media', () => {
  let db
  let config
  let alice
  let bob
  let conversation

  beforeAll(async () => {
    db = await startTestDatabase('db-media-ttl')
    config = makeTestConfig()
    await ensureIndexes()
    alice = await createUser(config)
    bob = await createUser(config)
    conversation = await createDirectConversation(alice.user, bob.user)
  })

  afterAll(async () => {
    await db.stop()
  })

  it('FILE-004: Upload has a 24-hour TTL index on createdAt', async () => {
    const indexes = await Upload.collection.indexes()
    const ttl = indexes.find((index) => index.key?.createdAt === 1 && index.expireAfterSeconds !== undefined)
    expect(ttl, JSON.stringify(indexes)).toBeTruthy()
    expect(ttl.expireAfterSeconds).toBe(24 * 60 * 60)
  })

  it('FILE-004: the TTL scan matches an orphan older than 24 hours', async () => {
    const orphan = await Upload.create({
      owner: alice.user._id,
      storageKey: 'qa/orphan.png',
      mimeType: 'image/png',
      size: 10,
    })
    const old = new Date(Date.now() - 2 * DAY_MS)
    await Upload.collection.updateOne({ _id: orphan._id }, { $set: { createdAt: old } })

    const cutoff = new Date(Date.now() - DAY_MS)
    const due = await Upload.find({ createdAt: { $lt: cutoff } }).select('_id').lean()
    expect(due.map((doc) => String(doc._id))).toContain(String(orphan._id))
  })

  it.fails('BUG-028 (FILE-023): the TTL scan leaves an attached upload older than 24 hours alone', async () => {
    const message = await createMessage({ conversation, sender: alice.user, text: 'photo holder' })
    const attached = await Upload.create({
      owner: alice.user._id,
      storageKey: 'qa/attached.png',
      mimeType: 'image/png',
      size: 10,
      attachedTo: message._id,
    })
    const old = new Date(Date.now() - 2 * DAY_MS)
    await Upload.collection.updateOne({ _id: attached._id }, { $set: { createdAt: old } })

    const cutoff = new Date(Date.now() - DAY_MS)
    const due = await Upload.find({ createdAt: { $lt: cutoff } }).select('_id').lean()
    expect(due.map((doc) => String(doc._id))).not.toContain(String(attached._id))
  })
})
