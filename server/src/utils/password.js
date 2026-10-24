import bcrypt from 'bcryptjs'

const COMMON_PASSWORDS = new Set(['password', '12345678', 'qwerty123', 'letmein', 'password1'])

export async function hashPassword(password) {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash)
}

export function isCommonPassword(password) {
  return COMMON_PASSWORDS.has(password.toLowerCase())
}
