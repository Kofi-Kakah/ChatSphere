import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { startTestDatabase } from '../helpers/db.js'
import { Conversation } from '../../src/models/Conversation.js'
import { Message } from '../../src/models/Message.js'

const MESSAGE_COUNT = 100_000
const CONVERSATION_COUNT = 20_000
const CONVERSATIONS_FOR_USER = 250

const TARGET_USER = new mongoose.Types.ObjectId()
const PEER_USER = new mongoose.Types.ObjectId()
const FILLERS = Array.from({ length: 40 }, () => new mongoose.Types.ObjectId())
const MESSAGE_CONVERSATION = new mongoose.Types.ObjectId()

function collectStages(node, found = []) {
  if (!node || typeof node !== 'object') return found
  if (typeof node.stage === 'string') found.push(node)
  for (const key of ['inputStage', 'queryPlan', 'winningPlan', 'innerStage', 'outerStage']) {
    if (node[key]) collectStages(node[key], found)
  }
  if (Array.isArray(node.inputStages)) {
    for (const stage of node.inputStages) collectStages(stage, found)
  }
  return found
}

function summarizePlan(explanation) {
  const stages = collectStages(explanation.queryPlanner?.winningPlan)
  return {
    stages,
    names: stages.map((stage) => stage.stage),
    indexes: stages.filter((stage) => stage.indexName).map((stage) => stage.indexName),
    stats: explanation.executionStats ?? {},
  }
}

async function insertInChunks(collection, documents, chunkSize = 10_000) {
  for (let offset = 0; offset < documents.length; offset += chunkSize) {
    await collection.insertMany(documents.slice(offset, offset + chunkSize), { ordered: false })
  }
}

describe('query plans on a 100,000-message dataset (DB-002)', () => {
  let db

  beforeAll(async () => {
    db = await startTestDatabase('db-plans')
    await Promise.all([Conversation.init(), Message.init()])

    const base = Date.now() - 30 * 24 * 60 * 60 * 1000
    const conversations = []
    for (let index = 0; index < CONVERSATION_COUNT; index += 1) {
      const involvesTarget = index < CONVERSATIONS_FOR_USER
      const participants = involvesTarget
        ? [{ user: TARGET_USER, role: 'member' }, { user: FILLERS[index % FILLERS.length], role: 'member' }]
        : [
            { user: FILLERS[index % FILLERS.length], role: 'member' },
            { user: FILLERS[(index + 7) % FILLERS.length], role: 'member' },
          ]
      const timestamp = new Date(base + index * 1000)
      conversations.push({
        type: 'group',
        name: `seed conversation ${index}`,
        participants,
        lastMessageAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }
    await insertInChunks(Conversation.collection, conversations, 5_000)

    const messages = []
    for (let index = 0; index < MESSAGE_COUNT; index += 1) {
      const timestamp = new Date(base + index * 1000)
      messages.push({
        conversation: MESSAGE_CONVERSATION,
        sender: index % 2 === 0 ? TARGET_USER : PEER_USER,
        type: 'text',
        text: `seed message ${index}`,
        attachments: [],
        clientId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }
    await insertInChunks(Message.collection, messages)
  }, 240_000)

  afterAll(async () => {
    await db.stop()
  })

  it('DB-002: message pagination uses the pagination index instead of a collection scan', async () => {
    expect(await Message.countDocuments({ conversation: MESSAGE_CONVERSATION })).toBe(MESSAGE_COUNT)
    expect(await Conversation.countDocuments({ 'participants.user': TARGET_USER })).toBe(CONVERSATIONS_FOR_USER)

    const newest = await Message.findOne({ conversation: MESSAGE_CONVERSATION }).sort({ _id: -1 }).select('_id').lean()
    const explanation = await Message.find({
      conversation: MESSAGE_CONVERSATION,
      _id: { $lt: newest._id },
    })
      .sort({ _id: -1 })
      .limit(30)
      .explain('executionStats')

    const plan = summarizePlan(explanation)
    expect(plan.names, JSON.stringify(plan.names)).not.toContain('COLLSCAN')
    expect(plan.indexes, JSON.stringify(plan.names)).toContain('conversation_1__id_-1')
    expect(plan.stats.nReturned).toBe(30)
    expect(plan.stats.totalDocsExamined ?? 0).toBeLessThanOrEqual(60)
  })

  it('DB-002: the conversation list uses an index scan instead of a collection scan', async () => {
    const explanation = await Conversation.find({ 'participants.user': TARGET_USER })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .explain('executionStats')

    const plan = summarizePlan(explanation)
    expect(plan.names, JSON.stringify(plan.names)).not.toContain('COLLSCAN')
    expect(plan.indexes, JSON.stringify(plan.names)).toContain('participants.user_1_lastMessageAt_-1')
    expect(plan.stats.nReturned).toBe(CONVERSATIONS_FOR_USER)
    expect(plan.stats.totalDocsExamined ?? 0).toBeLessThan(CONVERSATION_COUNT / 2)
  })
})
