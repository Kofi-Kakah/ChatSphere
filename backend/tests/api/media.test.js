import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createHmac } from 'node:crypto'
import { readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import {
  makeAnimatedGif,
  makeFakeDimensionPng,
  makeJpeg,
  makeOoxml,
  makeWebp,
  padTo,
  audioFixtures,
} from '../fixtures/media-fixtures.js'

const uploadRoot = fileURLToPath(new URL('../../.cache/test-uploads-media/', import.meta.url))
const assets = fileURLToPath(new URL('../../../tests/assets/', import.meta.url))

let db
let app
let config
let startTestDatabase
let createTestApp
let alice
let bob
let dave
let conversation
let Upload
let createUser
let createGroupConversation
let createMessage

beforeAll(async () => {
  process.env.UPLOAD_DIR = uploadRoot
  ;({ startTestDatabase } = await import('../helpers/db.js'))
  ;({ createTestApp } = await import('../helpers/server.js'))
  ;({ createUser, createGroupConversation, createMessage } = await import('../helpers/factories.js'))
  ;({ Upload } = await import('../../src/models/Upload.js'))

  db = await startTestDatabase('api_media')
  ;({ app, config } = createTestApp())
  await rm(uploadRoot, { recursive: true, force: true })
  ;[alice, bob, dave] = await Promise.all([
    createUser(config, { username: 'alice_media', displayName: 'Alice' }),
    createUser(config, { username: 'bob_media', displayName: 'Bob' }),
    createUser(config, { username: 'dave_media', displayName: 'Dave' }),
  ])
  const conversationModule = await import('../../src/models/Conversation.js')
  const [idA, idB] = [String(alice.user._id), String(bob.user._id)].sort()
  conversation = await conversationModule.Conversation.create({
    type: 'direct',
    directKey: `${idA}_${idB}`,
    participants: [
      { user: idA, role: 'member', joinedAt: new Date() },
      { user: idB, role: 'member', joinedAt: new Date() },
    ],
  })
})

afterAll(async () => {
  await db?.stop()
  await rm(uploadRoot, { recursive: true, force: true })
})

function uploadBuffer(asUser, buffer, filename) {
  return request(app).post('/api/uploads').set(asUser.header).attach('file', buffer, { filename })
}

function signedPath(id, exp = Date.now() + 60_000) {
  const sig = createHmac('sha256', config.JWT_ACCESS_SECRET).update(`${id}:${exp}`).digest('hex')
  return `/api/uploads/${id}?exp=${exp}&sig=${sig}`
}

async function attachToConversation(uploadId, originalName = 'file.bin', mimeType = 'application/octet-stream') {
  const message = await createMessage({
    conversation,
    sender: alice.user,
    type: 'image',
    text: '',
    attachments: [{ upload: uploadId, mimeType, size: 1, originalName }],
  })
  await Upload.updateOne({ _id: uploadId }, { attachedTo: message._id })
  return message
}

const png = () => readFile(join(assets, 'valid.png'))
const pdf = () => readFile(join(assets, 'valid.pdf'))

describe('Phase 7 image matrix', () => {
  it('FILE-005/014: a JPEG with GPS EXIF is measured, thumbnailed, and stored without EXIF', async () => {
    const fixture = await makeJpeg()
    const source = await sharp(fixture).metadata()
    expect(Boolean(source.exif), 'fixture must carry EXIF').toBe(true)

    const res = await uploadBuffer(alice, fixture, 'holiday.jpg')

    expect(res.status, JSON.stringify(res.body)).toBe(201)
    expect(res.body.mimeType).toBe('image/jpeg')
    expect(res.body.width).toBe(40)
    expect(res.body.height).toBe(30)

    const stored = await Upload.findById(res.body.uploadId).lean()
    expect(stored.width).toBe(40)
    expect(stored.height).toBe(30)
    expect(stored.thumbnailKey).toMatch(/^thumb\//)
    const storedBuffer = await readFile(join(uploadRoot, stored.storageKey))
    const storedMeta = await sharp(storedBuffer).metadata()
    expect(Boolean(storedMeta.exif), 'stored JPEG must have no EXIF/GPS block').toBe(false)
    const thumbMeta = await sharp(await readFile(join(uploadRoot, stored.thumbnailKey))).metadata()
    expect(Math.max(thumbMeta.width, thumbMeta.height)).toBe(200)
  })

  it('FILE-005: a WebP image is accepted and measured', async () => {
    const res = await uploadBuffer(alice, await makeWebp(), 'picture.webp')

    expect(res.status, JSON.stringify(res.body)).toBe(201)
    expect(res.body.mimeType).toBe('image/webp')
    expect(res.body.width).toBe(44)
    expect(res.body.height).toBe(33)
  })

  it('FILE-005: an animated GIF is accepted, measured, and thumbnailed', async () => {
    const created = await uploadBuffer(alice, await makeAnimatedGif(), 'party.gif')

    expect(created.status, JSON.stringify(created.body)).toBe(201)
    expect(created.body.mimeType).toBe('image/gif')
    expect(created.body.width).toBe(20)
    expect(created.body.height).toBe(20)
    const stored = await Upload.findById(created.body.uploadId).lean()
    expect(stored.thumbnailKey).toMatch(/^thumb\//)
    await expect(stat(join(uploadRoot, stored.storageKey))).resolves.toBeTruthy()
  })

  it('FILE-005: a stored animated GIF keeps all of its frames', async () => {
    const created = await uploadBuffer(alice, await makeAnimatedGif(), 'banner.gif')
    expect(created.status).toBe(201)
    const stored = await Upload.findById(created.body.uploadId).lean()
    const storedBuffer = await readFile(join(uploadRoot, stored.storageKey))
    const storedMeta = await sharp(storedBuffer, { animated: true }).metadata()
    expect(storedMeta.pages).toBe(2)
  })

  it('FILE-005: an image of exactly 10 MB is accepted', async () => {
    const source = await png()
    const exact = padTo(source, 10 * 1024 * 1024)

    const res = await uploadBuffer(alice, exact, 'exact-10mb.png')

    expect(res.status, JSON.stringify(res.body)).toBe(201)
    expect(res.body.width).toBe(120)
    expect(res.body.height).toBe(80)
  })

  it('FILE-005: an image of 10 MB + 1 byte is rejected with a clear message', async () => {
    const source = await png()
    const oversized = padTo(source, 10 * 1024 * 1024 + 1)

    const res = await uploadBuffer(alice, oversized, 'over-10mb.png')

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('BAD_REQUEST')
    expect(res.body.error.message).toBe('File too large')
  })

  it('FILE-012: the server stays up after a decompression bomb', async () => {
    const res = await uploadBuffer(alice, makeFakeDimensionPng(30_000, 30_000), 'bomb.png')
    expect(res.status).toBeGreaterThanOrEqual(400)

    const health = await request(app).get('/api/health')
    expect(health.status).toBe(200)
  })

  it('FILE-012: a decompression bomb is rejected with a clear 4xx', async () => {
    const res = await uploadBuffer(alice, makeFakeDimensionPng(30_000, 30_000), 'bomb2.png')

    expect([400, 413]).toContain(res.status)
    expect(res.body.error).toEqual({ code: 'INVALID_IMAGE', message: 'Invalid image' })
  })

  it('FILE-011: a truncated PNG is rejected with a clear 4xx', async () => {
    const source = await png()
    const res = await uploadBuffer(alice, source.subarray(0, 40), 'truncated.png')

    expect([400, 413]).toContain(res.status)
    expect(res.body.error).toEqual({ code: 'INVALID_IMAGE', message: 'Invalid image' })
  })
})

describe('Phase 7 document matrix', () => {
  it('FILE-006: DOCX, XLSX, and PPTX are accepted by content', async () => {
    for (const kind of ['docx', 'xlsx', 'pptx']) {
      const res = await uploadBuffer(alice, makeOoxml(kind), `document.${kind}`)
      expect(res.status, `${kind}: ${JSON.stringify(res.body)}`).toBe(201)
      expect(res.body.mimeType).toContain('openxmlformats-officedocument')
    }
  })

  it.fails('BUG-006 (FILE-006): plain TXT and CSV files are accepted', async () => {
    const txt = await uploadBuffer(alice, Buffer.from('ChatSphere QA fixture.\n'), 'notes.txt')
    expect(txt.status, JSON.stringify(txt.body)).toBe(201)
    expect(txt.body.mimeType).toBe('text/plain')

    const csv = await uploadBuffer(alice, Buffer.from('a,b\n1,2\n'), 'data.csv')
    expect(csv.status, JSON.stringify(csv.body)).toBe(201)
    expect(csv.body.mimeType).toBe('text/csv')
  })

  it('FILE-006: a document of exactly 25 MB is accepted', async () => {
    const source = await pdf()
    const res = await uploadBuffer(alice, padTo(source, 25 * 1024 * 1024), 'exact-25mb.pdf')

    expect(res.status, JSON.stringify(res.body)).toBe(201)
    expect(res.body.mimeType).toBe('application/pdf')
  })

  it('FILE-006: a document of 25 MB + 1 byte is rejected with a 4xx', async () => {
    const source = await pdf()
    const res = await uploadBuffer(alice, padTo(source, 25 * 1024 * 1024 + 1), 'over-25mb.pdf')

    expect([400, 413]).toContain(res.status)
    expect(res.body.error?.code).toBe('FILE_TOO_LARGE')
  })
})

describe('Phase 7 content sniffing and filenames', () => {
  it('FILE-008: script and executable text types are rejected', async () => {
    const contents = {
      'script.js': 'alert(document.cookie)\n',
      'page.html': '<html><script>alert(1)</script></html>\n',
      'shell.php': '<?php system($_GET["c"]); ?>\n',
      'run.sh': '#!/bin/sh\nrm -rf /\n',
      'run.bat': '@echo off\ndel /f /q C:\\*.*\n',
    }
    for (const [filename, body] of Object.entries(contents)) {
      const res = await uploadBuffer(alice, Buffer.from(body), filename)
      expect(res.status, `${filename}: ${JSON.stringify(res.body)}`).toBe(400)
    }
  })

  it('FILE-009: an executable renamed photo.jpg is rejected by magic bytes', async () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.from('ChatSphere test stub, not executable code\n')])
    const res = await uploadBuffer(alice, exe, 'photo.jpg')

    expect(res.status, JSON.stringify(res.body)).toBe(400)
  })

  it('FILE-010: double, missing, and uppercase extensions are decided by content', async () => {
    const source = await png()
    for (const filename of ['evil.php.jpg', 'noextension', 'PICTURE.PNG']) {
      const res = await uploadBuffer(alice, source, filename)
      expect(res.status, `${filename}: ${JSON.stringify(res.body)}`).toBe(201)
      expect(res.body.mimeType, filename).toBe('image/png')
    }

    const disguisedPdf = await uploadBuffer(alice, await pdf(), 'actually-a.png')
    expect(disguisedPdf.status).toBe(201)
    expect(disguisedPdf.body.mimeType).toBe('application/pdf')
  })

  it('FILE-013: Unicode, 300-character, traversal, and dotfile names use random storage keys', async () => {
    const source = await png()
    const names = [
      'résumé.png',
      `${'a'.repeat(296)}.png`,
      '../../etc/passwd.png',
      '.hidden.png',
    ]
    for (const filename of names) {
      const res = await uploadBuffer(alice, source, filename)
      expect(res.status, `${filename}: ${JSON.stringify(res.body)}`).toBe(201)
      const stored = await Upload.findById(res.body.uploadId).lean()
      expect(stored.storageKey, filename).toMatch(/^img\/[a-f0-9]{32}$/)
      expect(stored.storageKey).not.toContain('..')
      expect(stored.storageKey).not.toContain('passwd')
      const download = await request(app).get(signedPath(res.body.uploadId)).set(alice.header)
      expect(download.status, filename).toBe(200)
    }
  })

  it('FILE-013: an emoji filename downloads with a valid HTTP response', async () => {
    const res = await uploadBuffer(alice, await png(), '😀.png')
    expect(res.status).toBe(201)
    const stored = await Upload.findById(res.body.uploadId).lean()
    expect(stored.originalName).toBe('😀.png')
    const download = await request(app).get(signedPath(res.body.uploadId)).set(alice.header)
    expect(download.status).toBe(200)
    expect(download.headers['content-disposition']).toContain("filename*=UTF-8''%F0%9F%98%80.png")
  })

  it('FILE-013: a UTF-8 filename is stored decoded', async () => {
    const res = await uploadBuffer(alice, await png(), 'résumé.png')
    expect(res.status).toBe(201)
    const stored = await Upload.findById(res.body.uploadId).lean()
    expect(stored.originalName).toBe('résumé.png')
    const download = await request(app).get(signedPath(res.body.uploadId)).set(alice.header)
    expect(download.status).toBe(200)
  })

  it('FILE-013: a NUL filename is rejected with a 4xx, not a server error', async () => {
    const res = await uploadBuffer(alice, await png(), 'a\0b.png')
    expect([400, 413]).toContain(res.status)
    expect(res.body.error?.code).toBe('INVALID_UPLOAD')
  })
})

describe('Phase 7 serving and access', () => {
  it('FILE-016: a removed group member immediately loses access to a signed URL', async () => {
    const upload = await uploadBuffer(alice, await png(), 'group.png')
    expect(upload.status).toBe(201)
    const group = await createGroupConversation({
      creator: alice.user,
      members: [bob.user, dave.user],
      name: 'Media Group',
    })
    const message = await createMessage({
      conversation: group,
      sender: alice.user,
      type: 'image',
      text: '',
      attachments: [{ upload: upload.body.uploadId, mimeType: 'image/png', size: 1, originalName: 'group.png' }],
    })
    await Upload.updateOne({ _id: upload.body.uploadId }, { attachedTo: message._id })
    const path = signedPath(upload.body.uploadId)

    const before = await request(app).get(path).set(dave.header)
    expect(before.status).toBe(200)

    const removed = await request(app)
      .delete(`/api/conversations/${group._id}/members/${dave.user._id}`)
      .set(alice.header)
    expect(removed.status, JSON.stringify(removed.body)).toBe(200)

    const after = await request(app).get(path).set(dave.header)
    expect(after.status).toBe(403)
    const witness = await request(app).get(path).set(bob.header)
    expect(witness.status).toBe(200)
  })

  it('PHOTO-001: GET /api/conversations/:id/media returns paginated images', async () => {
    const upload = await uploadBuffer(alice, await png(), 'gallery.png')
    await attachToConversation(upload.body.uploadId, 'gallery.png', 'image/png')

    const res = await request(app)
      .get(`/api/conversations/${conversation._id}/media?type=image`)
      .set(alice.header)

    expect(res.status).toBe(200)
    expect(res.body.media[0]).toMatchObject({
      uploadId: String(upload.body.uploadId),
      mimeType: 'image/png',
      originalName: 'gallery.png',
    })
  })

  it('SD-004: the owner can mint a signed link for an upload', async () => {
    const upload = await uploadBuffer(alice, await png(), 'linked.png')
    const link = await request(app)
      .get(`/api/uploads/${upload.body.uploadId}/link`)
      .set(alice.header)

    expect(link.status).toBe(200)
    expect(link.body.url).toMatch(new RegExp(`^/uploads/${upload.body.uploadId}\\?exp=\\d+&sig=[a-f0-9]{64}$`))
    const fetched = await request(app).get(`/api${link.body.url}`).set(alice.header)
    expect(fetched.status).toBe(200)
    expect(fetched.headers['content-type']).toMatch(/^image\/png/)
  })

  it('PHOTO-001: the media list filters by category and denies non-members', async () => {
    const image = await uploadBuffer(alice, await png(), 'cat.png')
    const audio = await uploadBuffer(alice, audioFixtures.mp3(), 'cat.mp3')
    const doc = await uploadBuffer(alice, await pdf(), 'cat.pdf')
    await attachToConversation(image.body.uploadId, 'cat.png', 'image/png')
    await attachToConversation(audio.body.uploadId, 'cat.mp3', 'audio/mpeg')
    await attachToConversation(doc.body.uploadId, 'cat.pdf', 'application/pdf')

    const images = await request(app)
      .get(`/api/conversations/${conversation._id}/media?type=image`)
      .set(alice.header)
    expect(images.body.media.every((item) => item.mimeType.startsWith('image/'))).toBe(true)
    expect(images.body.media.some((item) => item.originalName === 'cat.png')).toBe(true)

    const audioList = await request(app)
      .get(`/api/conversations/${conversation._id}/media?type=audio`)
      .set(alice.header)
    expect(audioList.body.media.map((item) => item.originalName)).toContain('cat.mp3')

    const files = await request(app)
      .get(`/api/conversations/${conversation._id}/media?type=file`)
      .set(alice.header)
    expect(files.body.media.map((item) => item.originalName)).toContain('cat.pdf')
    expect(files.body.media.some((item) => item.mimeType.startsWith('image/'))).toBe(false)

    const forbidden = await request(app)
      .get(`/api/conversations/${conversation._id}/media?type=image`)
      .set(dave.header)
    expect(forbidden.status).toBe(403)
  })
})

describe('Phase 7 audio matrix', () => {
  it('AUD-006: MP3, M4A, WAV, and Ogg Vorbis under 20 MB are accepted', async () => {
    const cases = [
      ['song.mp3', 'mp3', 'audio/mpeg'],
      ['song.m4a', 'm4a', 'audio/x-m4a'],
      ['song.wav', 'wav', 'audio/wav'],
      ['song.ogg', 'oggVorbis', 'audio/ogg'],
    ]
    for (const [filename, fixture, mimeType] of cases) {
      const res = await uploadBuffer(alice, audioFixtures[fixture](), filename)
      expect(res.status, `${filename}: ${JSON.stringify(res.body)}`).toBe(201)
      expect(res.body.mimeType, filename).toBe(mimeType)
    }
  })

  it('AUD-006: WebM audio (Chrome MediaRecorder output) is accepted and stored as audio', async () => {
    const res = await uploadBuffer(alice, audioFixtures.webm(), 'voice.webm')
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    expect(res.body.mimeType).toBe('audio/webm')
  })

  it('AUD-006: Ogg/Opus audio is accepted without the codec parameter', async () => {
    const res = await uploadBuffer(alice, audioFixtures.oggOpus(), 'voice.opus.ogg')
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    expect(res.body.mimeType).toBe('audio/ogg')
  })

  it('AUD-006: audio of 20 MB + 1 byte is rejected with a clear message', async () => {
    const oversized = padTo(audioFixtures.mp3(), 20 * 1024 * 1024 + 1)
    const res = await uploadBuffer(alice, oversized, 'big.mp3')

    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('File too large')
  })

  it('AUD-006: a wrong type named .mp3 is rejected by content', async () => {
    const res = await uploadBuffer(alice, Buffer.from('<html><script>alert(1)</script></html>'), 'fake.mp3')
    expect(res.status).toBe(400)
  })

  it('AUD-007: corrupted audio fails cleanly and the server stays up', async () => {
    const res = await uploadBuffer(alice, Buffer.from('not audio at all'), 'broken.mp3')
    expect(res.status).toBe(400)
    expect((await request(app).get('/api/health')).status).toBe(200)
  })

  it('AUD-013: audio uploads store a duration', async () => {
    const res = await uploadBuffer(alice, audioFixtures.mp3(), 'duration.mp3')
    expect(res.status).toBe(201)
    const stored = await Upload.findById(res.body.uploadId).lean()
    expect(typeof stored.duration).toBe('number')
    expect(stored.duration).toBeGreaterThan(0)
    expect(res.body.duration).toBe(stored.duration)
  })

  it('AUD-013: a WAV upload stores its duration', async () => {
    const wav = audioFixtures.wav()
    const dataSize = 17_640
    wav.writeUInt32LE(36 + dataSize, 4)
    wav.writeUInt32LE(dataSize, 40)
    const res = await uploadBuffer(alice, Buffer.concat([wav, Buffer.alloc(dataSize)]), 'tone.wav')
    expect(res.status).toBe(201)
    expect(res.body.duration).toBeCloseTo(0.2, 2)
  })
})
