import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { User } from '../models/User.js'
import { Conversation } from '../models/Conversation.js'
import * as convService from '../services/conversation.service.js'

const socketsByUser = new Map()
const graceTimers = new Map()

export function attachSocketIO(server, config) {
  const io = new Server(server, { path: '/socket.io', cors: { origin: config.allowedOrigins, credentials: true } })

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
    if (!token) return next(new Error('unauthorized'))
    try {
      const payload = jwt.verify(token, config.JWT_ACCESS_SECRET)
      socket.userId = payload.sub
      next()
    } catch {
      next(new Error('unauthorized'))
    }
  })

  io.on('connection', async (socket) => {
    const userId = socket.userId
    // join user room
    socket.join(`user:${userId}`)

    // join conversation rooms
    const convs = await Conversation.find({ 'participants.user': userId }).select('_id')
    for (const c of convs) socket.join(`conv:${c._id}`)

    if (graceTimers.has(userId)) { clearTimeout(graceTimers.get(userId)); graceTimers.delete(userId) }
    if (!socketsByUser.has(userId)) socketsByUser.set(userId, new Set())
    socketsByUser.get(userId).add(socket)

    // presence snapshot
    const users = await User.find({}).select('_id lastSeenAt privacy')
    const snapshot = users.filter((u) => String(u._id) !== userId).map((u) => ({
      userId: String(u._id),
      online: socketsByUser.has(String(u._id)) && socketsByUser.get(String(u._id)).size > 0,
      lastSeenAt: u.lastSeenAt,
    }))
    socket.emit('presence:snapshot', { users: snapshot })

    const alreadyOnline = socketsByUser.get(userId).size > 1
    if (!alreadyOnline) {
      socket.broadcast.emit('presence:update', { userId, online: true })
    }

    // handlers
    socket.on('message:send', async (payload, ack) => {
      try {
        const { conversationId, clientId, type, text, uploadIds } = payload
        if (!mongoose.isValidObjectId(conversationId)) throw new Error('bad id')
        const conv = await Conversation.findById(conversationId)
        if (!conv || !conv.participants.some((p) => String(p.user) === userId)) throw new Error('forbidden')
        const existing = await (await import('../models/Message.js')).Message.findOne({ conversation: conversationId, sender: userId, clientId })
        let message
        if (existing) message = existing.toObject()
        else message = await convService.createMessage({ conversationId, sender: userId, type: type || 'text', text: text || '', clientId, uploadIds })
        ack?.({ ok: true, message })
        io.to(`conv:${conversationId}`).emit('message:new', { message })
      } catch (e) {
        ack?.({ ok: false, error: e.message })
      }
    })

    socket.on('typing:start', async ({ conversationId }) => {
      const conv = await Conversation.findById(conversationId)
      if (!conv || !conv.participants.some((p) => String(p.user) === userId)) return
      socket.to(`conv:${conversationId}`).emit('typing:update', { conversationId, userId, isTyping: true })
    })
    socket.on('typing:stop', async ({ conversationId }) => {
      const conv = await Conversation.findById(conversationId)
      if (!conv || !conv.participants.some((p) => String(p.user) === userId)) return
      socket.to(`conv:${conversationId}`).emit('typing:update', { conversationId, userId, isTyping: false })
    })

    socket.on('message:delivered', async ({ conversationId, messageId }) => {
      const conv = await Conversation.findById(conversationId)
      if (!conv) return
      const part = conv.participants.find((p) => String(p.user) === userId)
      if (part) { part.lastDeliveredMessage = messageId; await conv.save() }
      io.to(`conv:${conversationId}`).emit('message:status', { conversationId, userId, lastDeliveredMessage: messageId })
    })
    socket.on('message:read', async ({ conversationId, messageId }) => {
      const conv = await Conversation.findById(conversationId)
      if (!conv) return
      const part = conv.participants.find((p) => String(p.user) === userId)
      if (part) { part.lastReadMessage = messageId; await conv.save() }
      io.to(`conv:${conversationId}`).emit('message:status', { conversationId, userId, lastReadMessage: messageId })
    })

    socket.on('disconnect', () => {
      const set = socketsByUser.get(userId)
      if (set) {
        set.delete(socket)
        if (set.size === 0) {
          socketsByUser.delete(userId)
          const timer = setTimeout(async () => {
            const lastSeenAt = new Date()
            await User.findByIdAndUpdate(userId, { lastSeenAt })
            io.emit('presence:update', { userId, online: false, lastSeenAt })
            graceTimers.delete(userId)
          }, 10000)
          graceTimers.set(userId, timer)
        }
      }
    })
  })

  return io
}
