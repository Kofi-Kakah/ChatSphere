import { logger } from '../utils/logger.js'

export function notFoundHandler(_req, _res, next) {
  const error = new Error('Route not found')
  error.status = 404
  error.code = 'NOT_FOUND'
  next(error)
}

export function errorHandler(error, _req, res, _next) {
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
    ? error.status
    : 500
  const code = typeof error.code === 'string' ? error.code : 'INTERNAL_ERROR'

  if (status >= 500) {
    logger.error('request_failed', { status, code })
  }

  res.status(status).json({
    error: {
      code,
      message: status >= 500 ? 'An unexpected error occurred' : error.message,
    },
  })
}
