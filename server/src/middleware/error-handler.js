import { logger } from '../utils/logger.js'

export function notFoundHandler(_req, _res, next) {
  const error = new Error('Route not found')
  error.status = 404
  error.code = 'NOT_FOUND'
  next(error)
}

export function errorHandler(error, _req, res, next) {
  if (res.headersSent) {
    next(error)
    return
  }

  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
    ? error.status
    : 500
  const code = status >= 500
    ? 'INTERNAL_ERROR'
    : error.code === 'NOT_FOUND'
      ? 'NOT_FOUND'
      : 'BAD_REQUEST'

  if (status >= 500) {
    logger.error('request_failed', { status, code })
  }

  res.status(status).json({
    error: {
      code,
      message: status === 404 ? 'Route not found' : status >= 500 ? 'An unexpected error occurred' : 'Invalid request',
    },
  })
}
