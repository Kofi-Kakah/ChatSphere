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
    if (e.code === 11000) return Conversation.findOne({ directKey })
    throw e
  }
}

export async function listConversations(userId) {
  return Conversation.find({ 'participants.user': userId }).sort({ lastMessageAt: -1, updatedAt: -1 }).lean()
}

export async function getMessages(conversationId, before, limit = 30) {
  const filter = { conversation: conversationId }
  if (before) filter._id = { $lt: new mongoose.Types.ObjectId(before) }
  const msgs = await Message.find(filter).sort({ _id: -1 }).limit(limit).lean()
  return msgs.reverse()
}

export async function createMessage({ conversationId, sender, type, text, clientId }) {
  const msg = await Message.create({ conversation: conversationId, sender, type: type || 'text', text: text || '', clientId: clientId || null })
  await Conversation.findByIdAndUpdate(conversationId, {
    lastMessage: { id: msg._id, sender, type: msg.type, text: (msg.text || '').slice(0, 100), createdAt: msg.createdAt },
    lastMessageAt: msg.createdAt,
  })
  return msg.toObject()
}

export async function createGroup({ name, avatarUrl, memberIds, creatorId }) {
  const participants = [creatorId, ...memberIds].map((id, idx) => ({
    user: id,
    role: idx === 0 ? 'admin' : 'member',
    joinedAt: new Date(),
  }))
  const conv = await Conversation.create({
    type: 'group',
    name,
    avatarUrl: avatarUrl || '',
    createdBy: creatorId,
    participants,
  })
  await createMessage({ conversationId: conv._id, sender: creatorId, type: 'system', text: 'Group created' })
  return conv
}

export async function addMembers(convId, userIds, actorId) {
  const conv = await Conversation.findById(convId)
  if (!conv) throw new Error('not found')
  const actor = conv.participants.find((p) => String(p.user) === String(actorId))
  if (!actor || actor.role !== 'admin') { const e = new Error('forbidden'); e.status = 403; throw e }
  for (const id of userIds) {
    if (!conv.participants.some((p) => String(p.user) === String(id))) {
      conv.participants.push({ user: id, role: 'member', joinedAt: new Date() })
    }
  }
  await conv.save()
  await createMessage({ conversationId: conv._id, sender: actorId, type: 'system', text: 'Members added' })
  return conv
}

export async function removeMember(convId, targetId, actorId) {
  const conv = await Conversation.findById(convId)
  if (!conv) throw new Error('not found')
  const actor = conv.participants.find((p) => String(p.user) === String(actorId))
  if (!actor || actor.role !== 'admin') { const e = new Error('forbidden'); e.status = 403; throw e }
  conv.participants = conv.participants.filter((p) => String(p.user) !== String(targetId))
  await conv.save()
  await createMessage({ conversationId: conv._id, sender: actorId, type: 'system', text: 'Member removed' })
  return conv
}

export async function leaveGroup(convId, userId) {
  const conv = await Conversation.findById(convId)
  if (!conv) throw new Error('not found')
  const idx = conv.participants.findIndex((p) => String(p.user) === String(userId))
  if (idx === -1) return conv
  const wasAdmin = conv.participants[idx].role === 'admin'
  conv.participants.splice(idx, 1)
  // if last admin leaves, promote longest-standing
  if (wasAdmin && !conv.participants.some((p) => p.role === 'admin') && conv.participants.length) {
    conv.participants.sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))
    conv.participants[0].role = 'admin'
  }
  await conv.save()
  await createMessage({ conversationId: conv._id, sender: userId, type: 'system', text: 'Member left' })
  return conv
}
