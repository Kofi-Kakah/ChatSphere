import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestDatabase } from '../helpers/db.js'
import { User } from '../../src/models/User.js'
import { Conversation } from '../../src/models/Conversation.js'
import { Message } from '../../src/models/Message.js'
import { RefreshToken } from '../../src/models/RefreshToken.js'
import { Upload } from '../../src/models/Upload.js'

const MODELS = { User, Conversation, Message, RefreshToken, Upload }

function keySignature(key) {
  return JSON.stringify(key)
}

async function loadIndexes() {
  const byModel = {}
  for (const [name, model] of Object.entries(MODELS)) {
    await model.createIndexes()
    byModel[name] = await model.collection.indexes()
  }
  return byModel
}

function findIndex(indexes, key) {
  return indexes.find((index) => keySignature(index.key) === keySignature(key))
}

function extras(indexes, allowedKeys) {
  const allowed = new Set(allowedKeys.map(keySignature))
  return indexes
    .filter((index) => index.name !== '_id_')
    .filter((index) => !allowed.has(keySignature(index.key)))
    .map((index) => index.name)
}

describe('MongoDB indexes (DB-001, DB-010)', () => {
  let db
  let indexes

  beforeAll(async () => {
    db = await startTestDatabase('db-indexes')
    indexes = await loadIndexes()
  })

  afterAll(async () => {
    await db.stop()
  })

  it('DB-001: User has unique username and email indexes', () => {
    const username = findIndex(indexes.User, { username: 1 })
    const email = findIndex(indexes.User, { email: 1 })
    expect(username, 'username index missing').toBeDefined()
    expect(email, 'email index missing').toBeDefined()
    expect(username.unique).toBe(true)
    expect(email.unique).toBe(true)
  })

  it('DB-001: Conversation has unique sparse directKey and participants/lastMessageAt indexes', () => {
    const directKey = findIndex(indexes.Conversation, { directKey: 1 })
    const list = findIndex(indexes.Conversation, { 'participants.user': 1, lastMessageAt: -1 })
    expect(directKey, 'directKey index missing').toBeDefined()
    expect(directKey.unique).toBe(true)
    expect(directKey.sparse).toBe(true)
    expect(list, 'conversation list index missing').toBeDefined()
  })

  it('DB-001: Message has the pagination index and the partial unique clientId index', () => {
    const pagination = findIndex(indexes.Message, { conversation: 1, _id: -1 })
    const dedupe = findIndex(indexes.Message, { conversation: 1, sender: 1, clientId: 1 })
    expect(pagination, 'message pagination index missing').toBeDefined()
    expect(dedupe, 'message dedupe index missing').toBeDefined()
    expect(dedupe.unique).toBe(true)
    expect(dedupe.partialFilterExpression?.clientId?.$type).toBe('string')
  })

  it('DB-001: RefreshToken has a TTL index on expiresAt', () => {
    const ttl = findIndex(indexes.RefreshToken, { expiresAt: 1 })
    expect(ttl, 'refresh token TTL index missing').toBeDefined()
    expect(ttl.expireAfterSeconds).toBe(0)
  })

  it('DB-001: Upload has a TTL index on createdAt', () => {
    const ttl = findIndex(indexes.Upload, { createdAt: 1 })
    expect(ttl, 'upload TTL index missing').toBeDefined()
    expect(ttl.expireAfterSeconds).toBe(24 * 60 * 60)
  })

  it.fails('BUG-027 / DB-001: no indexes beyond those in the specification', () => {
    const extra = {
      User: extras(indexes.User, [{ username: 1 }, { email: 1 }]),
      Conversation: extras(indexes.Conversation, [
        { directKey: 1 },
        { 'participants.user': 1, lastMessageAt: -1 },
      ]),
      Message: extras(indexes.Message, [
        { conversation: 1, _id: -1 },
        { conversation: 1, sender: 1, clientId: 1 },
      ]),
      RefreshToken: extras(indexes.RefreshToken, [
        { tokenHash: 1 },
        { expiresAt: 1 },
      ]),
      Upload: extras(indexes.Upload, [{ createdAt: 1 }]),
    }
    expect(extra).toEqual({ User: [], Conversation: [], Message: [], RefreshToken: [], Upload: [] })
  })

  it.fails('BUG-028 / DB-010: the Upload TTL only expires orphaned uploads', () => {
    const ttl = findIndex(indexes.Upload, { createdAt: 1 })
    // An unfiltered TTL deletes attached uploads too, so every message that
    // references an upload loses its attachment metadata after 24 hours.
    expect(ttl.partialFilterExpression, 'TTL has no orphan-only filter').toBeDefined()
  })
})
