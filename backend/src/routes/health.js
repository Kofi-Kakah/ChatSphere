import { Router } from 'express'
import mongoose from 'mongoose'

const router = Router()

router.get('/health', (_req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1
  const status = databaseConnected ? 'ok' : 'unavailable'

  res.status(databaseConnected ? 200 : 503).json({
    status,
    database: databaseConnected ? 'connected' : 'disconnected',
  })
})

export default router
