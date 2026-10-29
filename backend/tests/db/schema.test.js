import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { startTestDatabase } from '../helpers/db.js'
import { suffix } from '../helpers/factories.js'
import { User } from '../../src/models/User.js'
import { Conversation } from '../../src/models/Conversation.js'
import { Message } from '../../src/models/Message.js'
import { getMessages } from '../../src/services/conversation.service.js'

async function validationErrors(document) {
  try {
    await document.validate()
    return {}
  } catch (error) {
    return error.errors ?? {}
  }
}

function baseUser(overrides = {}) {
  const tail = suffix()
  return new User({
    username: `schema${tail}`,
    email: `schema_${tail}@example.test`,
    displayName: 'Schema QA',
    passwordHash: 'not-a-real-hash',
    ...overrides,
  })
}

describe('Mongoose schema validation (DB-003)', () => {
  let db
  let userId
  let conversationId

  beforeAll(async () => {
    db = await startTestDatabase('db-schema')
    await Promise.all([User.init(), Conversation.init(), Message.init()])
    userId = new mongoose.Types.ObjectId()
    conversationId = new mongoose.Types.ObjectId()
  })

  afterAll(async () => {
    await db.stop()
  })

  it('DB-003: User required fields are enforced', async () => {
    const errors = await validationErrors(new User({}))
    expect(Object.keys(errors).sort()).toEqual(['displayName', 'email', 'passwordHash', 'username'])
  })

  it('DB-003: Message and Conversation required fields are enforced', async () => {
    const messageErrors = await validationErrors(new Message({}))
    expect(Object.keys(messageErrors).sort()).toEqual(['conversation', 'sender'])

    const conversationErrors = await validationErrors(new Conversation({}))
    expect(Object.keys(conversationErrors)).toContain('type')
  })

  it('DB-003: Message type is limited to the supported enum', async () => {
    for (const type of ['text', 'image', 'audio', 'file', 'system', 'call']) {
      expect(await validationErrors(new Message({ conversation: conversationId, sender: userId, type }))).toEqual({})
    }
    const errors = await validationErrors(new Message({
      conversation: conversationId,
      sender: userId,
      type: 'video',
    }))
    expect(errors.type?.name).toBe('ValidatorError')
  })

  it('DB-003: Conversation type, theme, and participant role are limited to their enums', async () => {
    const typeErrors = await validationErrors(new Conversation({ type: 'channel' }))
    expect(typeErrors.type?.name).toBe('ValidatorError')

    const themeErrors = await validationErrors(new Conversation({ type: 'group', theme: 'sunset' }))
    expect(themeErrors.theme?.name).toBe('ValidatorError')

    const roleErrors = await validationErrors(new Conversation({
      type: 'group',
      participants: [{ user: userId, role: 'owner' }],
    }))
    expect(roleErrors['participants.0.role']?.name).toBe('ValidatorError')
  })

  it('DB-003: privacy settings reject non-boolean values', async () => {
    const errors = await validationErrors(baseUser({ privacy: { sendReadReceipts: 'maybe' } }))
    expect(errors['privacy.sendReadReceipts']?.name).toBe('CastError')
  })

  it('DB-003: bio accepts 160 characters and rejects 161', async () => {
    const accepted = baseUser({ bio: 'a'.repeat(160) })
    expect(await validationErrors(accepted)).toEqual({})

    const rejected = baseUser({ bio: 'a'.repeat(161) })
    const errors = await validationErrors(rejected)
    expect(errors.bio?.name).toBe('ValidatorError')
  })

  it('DB-003: invalid ObjectIds are rejected before they reach MongoDB', async () => {
    const invalidMessage = new Message({ conversation: 'not-an-id', sender: userId })
    const errors = await validationErrors(invalidMessage)
    expect(errors.conversation?.name).toBe('CastError')
    await expect(Message.find({ conversation: 'not-an-id' }).exec()).rejects.toThrow(/Cast to ObjectId/i)
    await expect(Message.create({ conversation: 'not-an-id', sender: userId })).rejects.toMatchObject({
      name: 'ValidationError',
    })
  })

  it('DB-003: the message service returns typed errors for invalid ids and cursors', async () => {
    await expect(getMessages('not-an-id', userId)).rejects.toMatchObject({ status: 400, code: 'BAD_REQUEST' })
    await expect(getMessages(String(new mongoose.Types.ObjectId()), userId)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    })

    const conversation = await Conversation.create({
      type: 'direct',
      participants: [{ user: userId, role: 'member' }],
      directKey: `cursor_${suffix()}`,
    })
    await expect(getMessages(String(conversation._id), userId, { before: 'not-an-id' })).rejects.toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
    })
  })

  it.fails('BUG-019 / DB-003: Message.text enforces the 4000-character limit at the schema level', async () => {
    const errors = await validationErrors(new Message({
      conversation: conversationId,
      sender: userId,
      text: 'a'.repeat(4001),
    }))
    expect(errors.text, 'text over 4000 characters passed validation').toBeDefined()
  })
})
