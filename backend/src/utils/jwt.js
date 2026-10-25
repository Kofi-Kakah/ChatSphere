import jwt from 'jsonwebtoken'
import { randomBytes, createHash } from 'node:crypto'

export function signAccessToken(payload, secret, expiresIn = '15m') {
  return jwt.sign(payload, secret, { expiresIn })
}

export function verifyAccessToken(token, secret) {
  return jwt.verify(token, secret)
}

export function generateRefreshToken() {
  return randomBytes(48).toString('base64url')
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function generateFamilyId() {
  return randomBytes(16).toString('hex')
}
