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

  let status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
    ? error.status
    : 500
  let code = error.code
  let message = error.message

  if (error?.name === 'ZodError') {
    status = 400
    code = 'VALIDATION_ERROR'
    message = error.issues?.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') || 'Invalid request'
  }

  if (!code) code = status >= 500 ? 'INTERNAL_ERROR' : (status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST')
  if (!message) message = status >= 500 ? 'An unexpected error occurred' : 'Invalid request'
  if (status === 404 && !error.code) message = 'Route not found'

  if (status >= 500) {
    logger.error('request_failed', { status, code })
  }

  res.status(status).json({
    error: { code, message },
  })
}
