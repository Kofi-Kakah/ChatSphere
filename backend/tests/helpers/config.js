import { randomBytes } from 'node:crypto'

export function makeTestConfig(overrides = {}) {
  return {
    NODE_ENV: 'test',
    PORT: 0,
    allowedOrigins: ['http://localhost:5173'],
    JWT_ACCESS_SECRET: randomBytes(24).toString('hex'),
    JWT_REFRESH_SECRET: randomBytes(24).toString('hex'),
    ...overrides,
  }
}
