import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createHmac } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import mongoose from 'mongoose'
import { startTestDatabase } from '../helpers/db.js'
import { startTestServer } from '../helpers/server.js'
import { createDirectConversation, createMessage, createUser } from '../helpers/factories.js'
import { makeZip } from '../fixtures/media-fixtures.js'
import { Upload } from '../../src/models/Upload.js'

// Testing.md 6.1: upload attacks, including guessing an upload id.

let db
let server
let app
let alice
let bob
let dave
let conversation
const createdKeys = []

const uploadRoot = process.env.UPLOAD_DIR

function zip() {
  return makeZip([{ name: 'payload.txt', data: 'x' }])
}

async function upload(asUser, filename = 'notes.zip') {
  const res = await request(app)
    .post('/api/uploads')
    .set(asUser.header)
    .attach('file', zip(), { filename, contentType: 'application/zip' })
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  const doc = await Upload.findById(res.body.uploadId).lean()
  createdKeys.push(doc.storageKey)
  if (doc.thumbnailKey) createdKeys.push(doc.thumbnailKey)
  return doc
}

async function attachToConversation(uploadDoc) {
  const message = await createMessage({
    conversation,
    sender: alice.user,
    type: 'file',
    text: '',
    attachments: [
      {
        upload: uploadDoc._id,
        mimeType: uploadDoc.mimeType,
        size: uploadDoc.size,
        originalName: uploadDoc.originalName,
      },
    ],
  })
  await Upload.updateOne({ _id: uploadDoc._id }, { attachedTo: message._id })
  return message
}

function signedPath(id, exp = Date.now() + 60_000) {
  const sig = createHmac('sha256', server.config.JWT_ACCESS_SECRET).update(`${id}:${exp}`).digest('hex')
  return `/api/uploads/${id}?exp=${exp}&sig=${sig}`
}

beforeAll(async () => {
  db = await startTestDatabase('security_uploads')
  server = await startTestServer()
  app = server.app
  ;[alice, bob, dave] = await Promise.all([
    createUser(server.config, { username: 'alice_upsec' }),
    createUser(server.config, { username: 'bob_upsec' }),
    createUser(server.config, { username: 'dave_upsec' }),
  ])
  conversation = await createDirectConversation(alice.user, bob.user)
})

afterAll(async () => {
  for (const key of createdKeys) {
    await rm(join(uploadRoot, key), { force: true }).catch(() => {})
  }
  await server.stop()
  await db.stop()
})

describe('upload id guessing and ownership', () => {
  it('UPLOAD-SEC-001: a random well-formed upload id is a 404, not a different error', async () => {
    const guessed = new mongoose.Types.ObjectId()
    const link = await request(app).get(`/api/uploads/${guessed}/link`).set(alice.header)
    const file = await request(app).get(signedPath(guessed)).set(alice.header)
    console.log(`[upsec] guessed id -> link ${link.status}, signed file ${file.status}`)
    expect(link.status).toBe(404)
    expect(file.status).toBe(404)
    expect(file.body?.error?.code).toBe('NOT_FOUND')
  })

  it('UPLOAD-SEC-002: an unattached upload can only be linked by its owner', async () => {
    const doc = await upload(alice)
    const owner = await request(app).get(`/api/uploads/${doc._id}/link`).set(alice.header)
    const stranger = await request(app).get(`/api/uploads/${doc._id}/link`).set(dave.header)
    console.log(`[upsec] unattached link -> owner ${owner.status}, dave ${stranger.status}`)
    expect(owner.status).toBe(200)
    expect(stranger.status).toBe(403)
  })

  it('UPLOAD-SEC-003: a participant can link an attached upload, a non-participant cannot', async () => {
    const doc = await upload(alice)
    await attachToConversation(doc)
    const participant = await request(app).get(`/api/uploads/${doc._id}/link`).set(bob.header)
    const stranger = await request(app).get(`/api/uploads/${doc._id}/link`).set(dave.header)
    const directFile = await request(app).get(signedPath(doc._id)).set(dave.header)
    console.log(`[upsec] attached -> bob ${participant.status}, dave link ${stranger.status}, dave file ${directFile.status}`)
    expect(participant.status).toBe(200)
    expect(stranger.status).toBe(403)
    expect(directFile.status).toBe(403)
  })

  it('UPLOAD-SEC-004: a path traversal filename is reduced to its base name', async () => {
    const doc = await upload(alice, '../../evil.zip')
    console.log(`[upsec] traversal filename -> ${JSON.stringify(doc.originalName)} key=${doc.storageKey}`)
    expect(doc.originalName).toBe('evil.zip')
    expect(doc.storageKey.startsWith('file/')).toBe(true)
    expect(doc.storageKey.includes('..')).toBe(false)
  })

  it('UPLOAD-SEC-005: the link route rejects a malformed upload id', async () => {
    const link = await request(app).get('/api/uploads/not-an-id/link').set(alice.header)
    console.log(`[upsec] malformed id link -> ${link.status} ${JSON.stringify(link.body)}`)
    expect(link.status).toBe(400)
  })

  it.fails('UPLOAD-SEC-006 / BUG-089: the signed file route rejects a malformed upload id', async () => {
    const file = await request(app).get(signedPath('not-an-id')).set(alice.header)
    console.log(`[upsec] malformed id file -> ${file.status} ${JSON.stringify(file.body)}`)
    expect(file.status).toBe(400)
  })
})
