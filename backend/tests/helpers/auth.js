import { randomBytes, randomInt } from 'node:crypto'
import request from 'supertest'

export function uniqueUsername(prefix = 'user') {
  const digits = String(randomInt(1000, 9999))
  const tail = randomBytes(2).toString('hex')
  return `${prefix}${digits}${tail}`.slice(0, 20).toLowerCase()
}

export function buildUserPayload({ prefix = 'user', ...overrides } = {}) {
  return {
    username: uniqueUsername(prefix),
    email: `qa_${Date.now()}_${randomBytes(4).toString('hex')}@example.test`,
    displayName: 'QA User',
    password: 'Passw0rd!234',
    ...overrides,
  }
}

export async function registerUser(app, { prefix, ...overrides } = {}) {
  const payload = buildUserPayload({ prefix, ...overrides })
  const res = await request(app).post('/api/auth/register').send(payload)
  return {
    payload,
    res,
    user: res.body.user,
    accessToken: res.body.accessToken,
    setCookie: res.headers['set-cookie'],
  }
}

export async function loginUser(app, identifier, password) {
  const res = await request(app).post('/api/auth/login').send({ identifier, password })
  return { res, user: res.body.user, accessToken: res.body.accessToken, setCookie: res.headers['set-cookie'] }
}

export async function loginAs(app, { email, username, password }) {
  const result = await loginUser(app, email || username, password)
  if (result.res.status !== 200) {
    throw new Error(`login failed (${result.res.status}): ${JSON.stringify(result.res.body)}`)
  }
  return result
}
