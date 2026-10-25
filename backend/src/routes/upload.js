import { Router } from 'express'
import { uploadMiddleware, handleUpload, serveFile } from '../controllers/upload.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.post('/', requireAuth, uploadMiddleware, handleUpload)
router.get('/:id', requireAuth, serveFile)
export default router
