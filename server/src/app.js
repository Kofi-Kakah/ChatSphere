import cors from 'cors'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import healthRouter from './routes/health.js'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'

export function createApp(config) {
  const app = express()
  const allowedOrigins = new Set(config.allowedOrigins)

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
  app.use(express.json({ limit: '32kb' }))
  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }))
  app.use('/api', healthRouter)
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
