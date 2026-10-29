import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createHmac } from 'node:crypto'
import { readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startTestDatabase } from '../helpers/db.js'
import { createTestApp } from '../helpers/server.js'
import {
  createUser,
  createDirectConversation,
  createMessage,
  ensureIndexes,
} from '../helpers/factories.js'
import { Upload } from '../../src/models/Upload.js'

const assets = fileURLToPath(new URL('../../../tests/assets/', import.meta.url))
const uploadRoot = process.env.UPLOAD_DIR

let db
let app
let config
let alice
let bob
let dave
let conversation

beforeAll(async () => {
  db = await startTestDatabase('api_uploads')
  ;({ app, config } = createTestApp())
  await ensureIndexes()
  await rm(uploadRoot, { recursive: true, force: true })
  ;[alice, bob, dave] = await Promise.all([
    createUser(config, { username: 'alice_files', displayName: 'Alice' }),
    createUser(config, { username: 'bob_files', displayName: 'Bob' }),
    createUser(config, { username: 'dave_files', displayName: 'Dave' }),
  ])
  conversation = await createDirectConversation(alice.user, bob.user)
})

afterAll(async () => {
  await db.stop()
})

function upload(asUser, filename, options = {}) {
  return request(app).post('/api/uploads').set(asUser.header).attach('file', join(assets, filename), options)
}

function uploadBuffer(asUser, buffer, filename) {
  return request(app).post('/api/uploads').set(asUser.header).attach('file', buffer, { filename })
}

async function attachToConversation(uploadId) {
  const message = await createMessage({
    conversation,
    sender: alice.user,
    type: 'image',
    text: '',
    attachments: [
      {
        upload: uploadId,
        mimeType: 'image/png',
        size: 68,
        originalName: 'valid.png',
        width: 120,
        height: 80,
      },
    ],
  })
  await Upload.updateOne({ _id: uploadId }, { attachedTo: message._id })
  return message
}

function signedPath(id, exp = Date.now() + 60_000) {
  const sig = createHmac('sha256', config.JWT_ACCESS_SECRET).update(`${id}:${exp}`).digest('hex')
  return { path: `/api/uploads/${id}?exp=${exp}&sig=${sig}`, exp, sig }
}

describe('REST POST /api/uploads', () => {
  it('FILE-001/005: a valid PNG is stored, measured, and returned as an uploadId', async () => {
    const res = await upload(alice, 'valid.png')

    expect(res.status, `upload failed: ${JSON.stringify(res.body)}`).toBe(201)
    expect(String(res.body.uploadId)).toMatch(/^[a-f0-9]{24}$/)
    expect(res.body.mimeType).toBe('image/png')
    expect(res.body.width).toBe(120)
    expect(res.body.height).toBe(80)
    expect(res.body.storageKey).toBeUndefined()

    const stored = await Upload.findById(res.body.uploadId).lean()
    expect(String(stored.owner)).toBe(String(alice.user._id))
    expect(stored.storageKey).toMatch(/^img\//)
    expect(stored.thumbnailKey).toMatch(/^thumb\//)
    await expect(stat(join(uploadRoot, stored.storageKey))).resolves.toBeTruthy()
    await expect(stat(join(uploadRoot, stored.thumbnailKey))).resolves.toBeTruthy()
  })

  it('FILE-005: a valid GIF is accepted', async () => {
    const res = await upload(alice, 'valid.gif')
    expect(res.status).toBe(201)
    expect(res.body.mimeType).toBe('image/gif')
  })

  it('FILE-006: a valid PDF is accepted', async () => {
    const res = await upload(alice, 'valid.pdf')
    expect(res.status).toBe(201)
    expect(res.body.mimeType).toBe('application/pdf')
  })

  it('FILE-006: a valid ZIP is accepted', async () => {
    const res = await upload(alice, 'valid.zip')
    expect(res.status).toBe(201)
    expect(res.body.mimeType).toBe('application/zip')
  })

  it.fails('BUG-006 (FILE-006): a valid TXT file is accepted', async () => {
    const res = await upload(alice, 'valid.txt')
    expect(res.status).toBe(201)
    expect(res.body.mimeType).toBe('text/plain')
  })

  it('FILE-007/008/009: SVG, HTML spoofing PNG, and an executable are rejected', async () => {
    for (const filename of ['malicious.svg', 'spoofed-image.png', 'executable.exe']) {
      const res = await upload(alice, filename)
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
    }
  })

  it('FILE-011: corrupt and zero-byte files are rejected', async () => {
    const corrupt = await upload(alice, 'corrupt-image.jpg')
    expect(corrupt.status).toBe(400)

    const empty = await uploadBuffer(alice, Buffer.alloc(0), 'empty.png')
    expect(empty.status).toBe(400)
  })

  it('FILE-005: an image larger than 10 MB is rejected', async () => {
    const png = await readFile(join(assets, 'valid.png'))
    const oversized = Buffer.concat([png, Buffer.alloc(10 * 1024 * 1024)])

    const res = await uploadBuffer(alice, oversized, 'oversized.png')

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('BAD_REQUEST')
    expect(res.body.error.message).toBe('File too large')
  })

  it('BUG-012 (FILE-006): a file larger than 25 MB is rejected with a 4xx, not a 500', async () => {
    const oversized = Buffer.alloc(25 * 1024 * 1024 + 1)

    const res = await uploadBuffer(alice, oversized, 'oversized.pdf')

    expect(res.status).toBe(413)
    expect(res.body.error.code).toBe('FILE_TOO_LARGE')
  })

  it('POST /api/uploads without a file returns 400', async () => {
    const res = await request(app).post('/api/uploads').set(alice.header)
    expect(res.status).toBe(400)
  })
})

describe('REST GET /api/uploads/:id', () => {
  it('FILE-015/017: a signed URL serves the file with safe headers', async () => {
    const created = await upload(alice, 'valid.png')
    await attachToConversation(created.body.uploadId)
    const { path } = signedPath(created.body.uploadId)

    const res = await request(app).get(path).set(alice.header)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/^image\/png/)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['content-disposition']).toMatch(/^inline; filename="valid\.png"$/)
    expect(res.body.length).toBeGreaterThan(0)
  })

  it('FILE-015: an expired signature is rejected with 403', async () => {
    const created = await upload(alice, 'valid.png')
    const exp = Date.now() - 60_000
    const sig = createHmac('sha256', config.JWT_ACCESS_SECRET).update(`${created.body.uploadId}:${exp}`).digest('hex')

    const res = await request(app)
      .get(`/api/uploads/${created.body.uploadId}?exp=${exp}&sig=${sig}`)
      .set(alice.header)

    expect(res.status).toBe(403)
  })

  it('FILE-015: a tampered signature is rejected with 403', async () => {
    const created = await upload(alice, 'valid.png')
    const { path } = signedPath(created.body.uploadId)
    const tampered = `${path.slice(0, -1)}${path.endsWith('a') ? 'b' : 'a'}`

    const res = await request(app).get(tampered).set(alice.header)
    expect(res.status).toBe(403)
  })

  it('FILE-015: a missing signature is rejected with 403', async () => {
    const created = await upload(alice, 'valid.png')
    const res = await request(app).get(`/api/uploads/${created.body.uploadId}`).set(alice.header)
    expect(res.status).toBe(403)
  })

  it('FILE-016: a conversation participant who is not the owner can download', async () => {
    const created = await upload(alice, 'valid.png')
    await attachToConversation(created.body.uploadId)
    const { path } = signedPath(created.body.uploadId)

    const res = await request(app).get(path).set(bob.header)

    expect(res.status).toBe(200)
  })

  it('FILE-016: the owner can preview an upload before it is attached', async () => {
    const created = await upload(alice, 'valid.png')
    const { path } = signedPath(created.body.uploadId)

    const res = await request(app).get(path).set(alice.header)

    expect(res.status).toBe(200)
  })

  it('FILE-016: a non-participant with a valid signature is forbidden', async () => {
    const created = await upload(alice, 'valid.png')
    await attachToConversation(created.body.uploadId)
    const { path } = signedPath(created.body.uploadId)

    const res = await request(app).get(path).set(dave.header)

    expect(res.status).toBe(403)
  })

  it('FILE-017: stored files are not exposed on a public static path', async () => {
    const created = await upload(alice, 'valid.png')
    const stored = await Upload.findById(created.body.uploadId).lean()

    const res = await request(app).get(`/uploads/${stored.storageKey}`)
    expect(res.status).toBe(404)
  })
})
