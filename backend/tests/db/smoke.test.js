import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { assertTestDatabaseName, startTestDatabase } from '../helpers/db.js'
import { buildUserPayload } from '../helpers/auth.js'
import { User } from '../../src/models/User.js'
import { hashPassword } from '../../src/utils/password.js'

describe('database smoke', () => {
  let db

  beforeAll(async () => {
    db = await startTestDatabase('db')
  })

  afterAll(async () => {
    await db.stop()
  })

  it('refuses a non-test database name', () => {
    expect(() => assertTestDatabaseName('chatsphere')).toThrow(/non-test database/i)
    expect(() => assertTestDatabaseName('chatsphere_test_guard')).not.toThrow()
  })

  it('connects to a test database and keeps passwordHash out of default reads', async () => {
    expect(mongoose.connection.name).toMatch(/test/i)

    const payload = buildUserPayload({ prefix: 'dbuser' })
    const created = await User.create({
      username: payload.username,
      email: payload.email,
      displayName: payload.displayName,
      passwordHash: await hashPassword(payload.password),
    })

    const found = await User.findById(created._id)
    expect(found.username).toBe(payload.username)
    expect(found.passwordHash).toBeUndefined()
  })
})
