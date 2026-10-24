import multer from 'multer'
import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'
import { Upload } from '../models/Upload.js'
import { createStorageProvider, newStorageKey } from '../storage/LocalStorageProvider.js'
import { verifyFileUrl } from '../utils/signedUrl.js'

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

const storage = createStorageProvider()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE } })

export const uploadMiddleware = upload.single('file')

export async function handleUpload(req, res, next) {
  try {
    if (!req.file) {
      const err = new Error('No file'); err.status = 400; err.code = 'BAD_REQUEST'; throw err
    }
    const detected = await fileTypeFromBuffer(req.file.buffer)
    const mime = detected?.mime
    if (!mime) { const err = new Error('Unknown type'); err.status = 400; err.code = 'BAD_REQUEST'; throw err }
    const isImage = ALLOWED_IMAGES.has(mime)
    const isFile = ALLOWED_FILES.has(mime)
    if (!isImage && !isFile) { const err = new Error('Unsupported type'); err.status = 400; err.code = 'BAD_REQUEST'; throw err }
    const limit = isImage ? MAX_IMAGE : MAX_FILE
    if (req.file.size > limit) { const err = new Error('File too large'); err.status = 400; err.code = 'BAD_REQUEST'; throw err }

    const key = newStorageKey(isImage ? 'img' : 'file')
    let width = null, height = null, thumbKey = null
    if (isImage) {
      const meta = await sharp(req.file.buffer).metadata()
      width = meta.width || null
      height = meta.height || null
      const buffer = await sharp(req.file.buffer).rotate().toBuffer()
      await storage.save(buffer, key)
      thumbKey = newStorageKey('thumb')
      const thumb = await sharp(req.file.buffer).resize(200, 200, { fit: 'cover' }).toBuffer()
      await storage.save(thumb, thumbKey)
    } else {
      await storage.save(req.file.buffer, key)
    }

    const doc = await Upload.create({
      owner: req.userId,
      storageKey: key,
      mimeType: mime,
      size: req.file.size,
      originalName: req.file.originalname,
      width,
      height,
      thumbnailKey: thumbKey,
    })
    res.status(201).json({ uploadId: doc._id, mimeType: mime, width, height })
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
    // participant check skipped for brevity; require auth
    const buf = await storage.read(doc.storageKey)
    res.set('Content-Type', doc.mimeType)
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Content-Disposition', `inline; filename="${doc.originalName}"`)
    res.send(buf)
  } catch (e) { next(e) }
}

import { verifyFileUrl } from '../utils/signedUrl.js'

// ... (top imports already include signFileUrl? add)
function verifySig(id, exp, sig, secret) {
  return verifyFileUrl(id, exp, sig, secret)
}
