import jwt from 'jsonwebtoken'
import { verifyAccessToken } from '../utils/jwt.js'

export function requireAuth(config) {
  const middleware = (req, res, next) => {
    const cfg = config || req.app?.locals?.config
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) {
      const err = new Error('Unauthorized')
      err.status = 401
      err.code = 'UNAUTHORIZED'
      return next(err)
    }
    try {
      const payload = verifyAccessToken(token, cfg.JWT_ACCESS_SECRET)
      req.userId = payload.sub
      next()
    } catch {
      const err = new Error('Unauthorized')
      err.status = 401
      err.code = 'UNAUTHORIZED'
      next(err)
    }
  }
  if (config) return middleware
  return middleware
}
