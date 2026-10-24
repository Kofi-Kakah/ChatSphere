import mongoose from 'mongoose'
import { Conversation } from '../models/Conversation.js'
import { Message } from '../models/Message.js'

export async function findOrCreateDirect(a, b) {
  const [x, y] = [String(a), String(b)].sort()
  const directKey = `${x}_${y}`
  try {
    let conv = await Conversation.findOne({ directKey })
    if (conv) return conv
    conv = await Conversation.create({
      type: 'direct',
      participants: [
        { user: a, role: 'member', joinedAt: new Date() },
        { user: b, role: 'member', joinedAt: new Date() },
      ],
      directKey,
    })
    return conv
  } catch (e) {
    if (e.code === 11000) {
      return Conversation.findOne({ directKey })
    }
    throw e
  }
}

export async function listConversations(userId) {
  return Conversation.find({ 'participants.user': userId })
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .lean()
}

export async function getMessages(conversationId, before, limit = 30) {
  const filter = { conversation: conversationId }
  if (before) filter._id = { $lt: new mongoose.Types.ObjectId(before) }
  const msgs = await Message.find(filter).sort({ _id: -1 }).limit(limit).lean()
  return msgs.reverse()
}

export async function createMessage({ conversationId, sender, type, text, clientId, uploadIds }) {
  const msg = await Message.create({ conversation: conversationId, sender, type, text, clientId })
  await Conversation.findByIdAndUpdate(conversationId, {
    lastMessage: { id: msg._id, sender, type, text: (text || '').slice(0, 100), createdAt: msg.createdAt },
    lastMessageAt: msg.createdAt,
  })
  return msg.toObject()
}
