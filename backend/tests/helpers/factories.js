import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { User } from '../../src/models/User.js'
import { Conversation } from '../../src/models/Conversation.js'
import { Message } from '../../src/models/Message.js'
import { signAccessToken } from '../../src/utils/jwt.js'

export const TEST_PASSWORD = 'Passw0rd!234'

let cachedPasswordHash = null

async function passwordHash() {
  if (!cachedPasswordHash) cachedPasswordHash = await bcrypt.hash(TEST_PASSWORD, 4)
  return cachedPasswordHash
}

export function suffix() {
  return randomBytes(4).toString('hex')
}

export function authHeader(token) {
  return { Authorization: `Bearer ${token}` }
}

export function idOf(value) {
  return String(value?._id ?? value)
}

export async function createUser(config, overrides = {}) {
  const tail = suffix()
  const user = await User.create({
    username: `qa${tail}`,
    email: `qa_${tail}@example.test`,
    displayName: `QA ${tail}`,
    passwordHash: await passwordHash(),
    ...overrides,
  })
  const token = signAccessToken({ sub: String(user._id) }, config.JWT_ACCESS_SECRET)
  return { user, token, password: TEST_PASSWORD, header: authHeader(token) }
}

export async function createDirectConversation(userA, userB, overrides = {}) {
  const [idA, idB] = [idOf(userA), idOf(userB)].sort()
  return Conversation.create({
    type: 'direct',
    directKey: `${idA}_${idB}`,
    participants: [
      { user: idA, role: 'member', joinedAt: new Date() },
      { user: idB, role: 'member', joinedAt: new Date() },
    ],
    ...overrides,
  })
}

export async function createGroupConversation({ creator, members, name = 'QA Group', ...overrides }) {
  const participants = [
    { user: idOf(creator), role: 'admin', joinedAt: new Date() },
    ...members.map((member) => ({ user: idOf(member), role: 'member', joinedAt: new Date() })),
  ]
  return Conversation.create({
    type: 'group',
    name,
    createdBy: idOf(creator),
    participants,
    ...overrides,
  })
}

export async function createMessage({ conversation, sender, ...overrides }) {
  return Message.create({
    conversation: idOf(conversation),
    sender: idOf(sender),
    type: 'text',
    text: 'QA message',
    ...overrides,
  })
}

export async function seedMessages({ conversation, sender, count, startAt = Date.now() - 60_000 }) {
  const docs = Array.from({ length: count }, (_, index) => ({
    conversation: idOf(conversation),
    sender: idOf(sender),
    type: 'text',
    text: `message ${index + 1}`,
    createdAt: new Date(startAt + index * 1000),
    updatedAt: new Date(startAt + index * 1000),
  }))
  return Message.insertMany(docs)
}

export async function ensureIndexes() {
  await Promise.all([User.init(), Conversation.init(), Message.init()])
}
