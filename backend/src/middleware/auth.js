import { verifyAccessToken } from '../utils/jwt.js'

export function requireAuth(req, res, next) {
  const config = req.app?.locals?.config
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    const err = new Error('Unauthorized')
    err.status = 401
    err.code = 'UNAUTHORIZED'
    return next(err)
  }

  try {
    const payload = verifyAccessToken(token, config.JWT_ACCESS_SECRET)
    req.userId = payload.sub
    next()
  } catch {
    const err = new Error('Unauthorized')
    err.status = 401
    err.code = 'UNAUTHORIZED'
    next(err)
  }
}
