import cors from 'cors'
import cookieParser from 'cookie-parser'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import healthRouter from './routes/health.js'
import uploadRouter from './routes/upload.js'
import conversationsRouter from './routes/conversations.js'
import authRouter from './routes/auth.js'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'
import { requireAuth } from './middleware/auth.js'

export function createApp(config) {
  const app = express()
  const allowedOrigins = new Set(config.allowedOrigins)

  app.locals.config = config
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true)
        return
      }
      callback(null, false)
    },
  }))
  app.use(cookieParser())
  app.use(express.json({ limit: '32kb' }))
  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }))
  app.use('/api', healthRouter)
  app.use('/api/uploads', uploadRouter)
  app.use('/api/conversations', conversationsRouter)
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false })
  app.use('/api/auth/login', authLimiter)
  app.use('/api/auth/register', authLimiter)
  app.use('/api/auth', authRouter)
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
