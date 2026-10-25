import { User } from '../models/User.js'
import { RefreshToken } from '../models/RefreshToken.js'
import { hashPassword, verifyPassword, isCommonPassword } from '../utils/password.js'
import { signAccessToken, generateRefreshToken, hashToken, generateFamilyId } from '../utils/jwt.js'

const ACCESS_EXPIRES = '15m'
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000

export async function registerUser({ username, email, displayName, password }, config) {
  if (isCommonPassword(password)) {
    const err = new Error('Common password')
    err.status = 400
    err.code = 'WEAK_PASSWORD'
    throw err
  }
  const existing = await User.findOne({ $or: [{ username }, { email }] })
  if (existing) {
    const err = new Error('Conflict')
    err.status = 409
    err.code = 'CONFLICT'
    throw err
  }
  const passwordHash = await hashPassword(password)
  const user = await User.create({ username, email, displayName, passwordHash })
  return issueTokens(user, config)
}

export async function loginUser({ identifier, password }, config) {
  const user = await User.findOne({
    $or: [{ username: identifier.toLowerCase() }, { email: identifier.toLowerCase() }],
  }).select('+passwordHash')
  if (!user) {
    const err = new Error('Invalid credentials')
    err.status = 401
    err.code = 'INVALID_CREDENTIALS'
    throw err
  }
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) {
    const err = new Error('Invalid credentials')
    err.status = 401
    err.code = 'INVALID_CREDENTIALS'
    throw err
  }
  return issueTokens(user, config)
}

async function issueTokens(user, config) {
  const accessToken = signAccessToken({ sub: String(user._id) }, config.JWT_ACCESS_SECRET, ACCESS_EXPIRES)
  const refresh = generateRefreshToken()
  const familyId = generateFamilyId()
  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(refresh),
    familyId,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  })
  return { user: sanitizeUser(user), accessToken, refreshToken: refresh }
}

export async function refreshTokens(refreshToken, config, meta = {}) {
  if (!refreshToken) {
    const err = new Error('Missing refresh token')
    err.status = 401
    err.code = 'UNAUTHORIZED'
    throw err
  }
  const hash = hashToken(refreshToken)
  const stored = await RefreshToken.findOne({ tokenHash: hash })
  if (!stored) {
    const err = new Error('Invalid refresh token')
    err.status = 401
    err.code = 'UNAUTHORIZED'
    throw err
  }
  if (stored.revokedAt) {
    // reuse detection: revoke whole family
    await RefreshToken.updateMany({ familyId: stored.familyId }, { revokedAt: new Date() })
    const err = new Error('Token reuse detected')
    err.status = 401
    err.code = 'TOKEN_REUSE'
    throw err
  }
  if (stored.expiresAt < new Date()) {
    const err = new Error('Expired refresh token')
    err.status = 401
    err.code = 'UNAUTHORIZED'
    throw err
  }
  // rotate
  stored.revokedAt = new Date()
  await stored.save()
  const user = await User.findById(stored.user)
  const newRefresh = generateRefreshToken()
  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(newRefresh),
    familyId: stored.familyId,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    userAgent: meta.userAgent || '',
    ip: meta.ip || '',
  })
  const accessToken = signAccessToken({ sub: String(user._id) }, config.JWT_ACCESS_SECRET, ACCESS_EXPIRES)
  return { user: sanitizeUser(user), accessToken, refreshToken: newRefresh }
}

export async function logoutUser(refreshToken) {
  if (!refreshToken) return
  const hash = hashToken(refreshToken)
  await RefreshToken.updateOne({ tokenHash: hash }, { revokedAt: new Date() })
}

export async function getUserById(id) {
  const user = await User.findById(id)
  if (!user) return null
  return sanitizeUser(user)
}

function sanitizeUser(user) {
  const u = user.toObject ? user.toObject() : user
  delete u.passwordHash
  return u
}
