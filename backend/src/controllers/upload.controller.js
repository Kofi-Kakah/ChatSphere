import mongoose from 'mongoose'
import multer from 'multer'
import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'
import { Upload } from '../models/Upload.js'
import { Message } from '../models/Message.js'
import { Conversation } from '../models/Conversation.js'
import { createStorageProvider, newStorageKey } from '../storage/LocalStorageProvider.js'
import { signFileUrl, verifyFileUrl } from '../utils/signedUrl.js'
import { audioDuration } from '../utils/audioDuration.js'

const ALLOWED_IMAGES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const ALLOWED_FILES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
])
const MAX_IMAGE = 10 * 1024 * 1024
const MAX_FILE = 25 * 1024 * 1024
const ALLOWED_AUDIO = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'audio/x-m4a',
])
const MAX_AUDIO = 20 * 1024 * 1024
const MAX_IMAGE_PIXELS = 100_000_000
const MAX_ANIMATED_FRAMES = 500
// file-type reports the WebM container as video even for audio-only recordings.
const AUDIO_ALIASES = new Map([['video/webm', 'audio/webm']])

function normalizeMime(mime) {
  if (!mime) return mime
  const base = mime.split(';')[0].trim().toLowerCase()
  return AUDIO_ALIASES.get(base) || base
}

const storage = createStorageProvider()
function invalidImage() {
  const err = new Error('Invalid image')
  err.status = 400
  err.code = 'INVALID_IMAGE'
  return err
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE } })
const uploadSingle = upload.single('file')

export function uploadMiddleware(req, res, next) {
  uploadSingle(req, res, (error) => {
    if (!error) { next(); return }
    const err = new Error(error.code === 'LIMIT_FILE_SIZE' ? 'File too large' : 'Invalid upload')
    err.status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    err.code = error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD'
    next(err)
  })
}

// busboy decodes multipart header parameters as latin1; recover the UTF-8 bytes the client sent.
function decodeFilename(raw) {
  if (!raw) return 'file'
  const utf8 = Buffer.from(raw, 'latin1').toString('utf8')
  return utf8.includes('\uFFFD') ? raw : utf8
}

function sanitizeFilename(raw) {
  const base = decodeFilename(raw).split(/[\\/]/).pop() || 'file'
  const cleaned = base.replace(/[\u0000-\u001F\u007F]/g, '').replace(/^\.+/, '').trim()
  return (cleaned || 'file').slice(0, 255)
}

function contentDisposition(name) {
  if (/^[\x20-\x7E]+$/.test(name) && !/["\\]/.test(name)) {
    return `inline; filename="${name}"`
  }
  const fallback = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'file'
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

export async function handleUpload(req, res, next) {
  try {
    if (!req.file) {
      const err = new Error('No file'); err.status = 400; err.code = 'BAD_REQUEST'; throw err
    }
    const detected = await fileTypeFromBuffer(req.file.buffer)
    const mime = normalizeMime(detected?.mime)
    if (!mime) { const err = new Error('Unknown type'); err.status = 400; err.code = 'BAD_REQUEST'; throw err }
    const isImage = ALLOWED_IMAGES.has(mime)
    const isAudio = ALLOWED_AUDIO.has(mime)
    const isFile = ALLOWED_FILES.has(mime)
    if (!isImage && !isAudio && !isFile) { const err = new Error('Unsupported type'); err.status = 400; err.code = 'BAD_REQUEST'; throw err }
    const limit = isImage ? MAX_IMAGE : isAudio ? MAX_AUDIO : MAX_FILE
    if (req.file.size > limit) { const err = new Error('File too large'); err.status = 400; err.code = 'BAD_REQUEST'; throw err }

    const key = newStorageKey(isImage ? 'img' : isAudio ? 'audio' : 'file')
    let width = null, height = null, thumbKey = null
    const duration = isAudio ? audioDuration(req.file.buffer, mime) : null
    if (isImage) {
      let buffer, thumb
      try {
        const meta = await sharp(req.file.buffer, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata()
        width = meta.width || null
        height = meta.height || null
        if (!width || !height || width * height > MAX_IMAGE_PIXELS) throw invalidImage()
        if (mime === 'image/gif') {
          if ((meta.pages || 1) > MAX_ANIMATED_FRAMES) throw invalidImage()
          const gif = { delay: meta.delay }
          if (Number.isInteger(meta.loop)) gif.loop = meta.loop
          buffer = await sharp(req.file.buffer, { animated: true, limitInputPixels: MAX_IMAGE_PIXELS })
            .gif(gif)
            .toBuffer()
        } else {
          buffer = await sharp(req.file.buffer, { limitInputPixels: MAX_IMAGE_PIXELS }).rotate().toBuffer()
        }
        thumb = await sharp(req.file.buffer, { limitInputPixels: MAX_IMAGE_PIXELS })
          .resize(200, 200, { fit: 'cover' })
          .toBuffer()
      } catch (error) {
        if (error.status) throw error
        throw invalidImage()
      }
      await storage.save(buffer, key)
      thumbKey = newStorageKey('thumb')
      await storage.save(thumb, thumbKey)
    } else {
      await storage.save(req.file.buffer, key)
    }

    const doc = await Upload.create({
      owner: req.userId,
      storageKey: key,
      mimeType: mime,
      size: req.file.size,
      originalName: sanitizeFilename(req.file.originalname),
      width,
      height,
      duration,
      thumbnailKey: thumbKey,
    })
    res.status(201).json({ uploadId: doc._id, mimeType: mime, width, height, duration })
  } catch (e) { next(e) }
}

export async function issueLink(req, res, next) {
  try {
    const { id } = req.params
    if (!mongoose.isValidObjectId(id)) {
      const err = new Error('Invalid upload id'); err.status = 400; err.code = 'BAD_REQUEST'; throw err
    }
    const doc = await Upload.findById(id).lean()
    if (!doc) { const err = new Error('Not found'); err.status = 404; err.code = 'NOT_FOUND'; throw err }
    if (!(await canAccessUpload(doc, req.userId))) {
      const err = new Error('Forbidden'); err.status = 403; err.code = 'FORBIDDEN'; throw err
    }
    const { exp, sig } = signFileUrl(id, req.app.locals.config.JWT_ACCESS_SECRET)
    res.json({
      url: `/uploads/${id}?exp=${exp}&sig=${sig}`,
      expiresAt: new Date(exp).toISOString(),
    })
  } catch (e) { next(e) }
}

export async function serveFile(req, res, next) {
  try {
    const { id } = req.params
    const { exp, sig } = req.query
    const cfg = req.app.locals.config
    if (!verifySig(id, exp, sig, cfg.JWT_ACCESS_SECRET)) {
      const err = new Error('Forbidden'); err.status = 403; err.code = 'FORBIDDEN'; throw err
    }
    const doc = await Upload.findById(id)
    if (!doc) { const err = new Error('Not found'); err.status = 404; err.code = 'NOT_FOUND'; throw err }
    if (!(await canAccessUpload(doc, req.userId))) {
      const err = new Error('Forbidden'); err.status = 403; err.code = 'FORBIDDEN'; throw err
    }
    const buf = await storage.read(doc.storageKey)
    res.set('Content-Type', doc.mimeType)
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Content-Disposition', contentDisposition(doc.originalName))
    res.send(buf)
  } catch (e) { next(e) }
}

async function canAccessUpload(doc, userId) {
  const message = await Message.findOne({ 'attachments.upload': doc._id }).select('conversation').lean()
  if (!message) return String(doc.owner) === String(userId)
  const participant = await Conversation.exists({
    _id: message.conversation,
    'participants.user': userId,
  })
  return Boolean(participant)
}

function verifySig(id, exp, sig, secret) {
  return verifyFileUrl(id, exp, sig, secret)
}
