import mongoose from 'mongoose'
import { WebSocketServer } from 'ws'
import jwt from 'jsonwebtoken'
import { Conversation } from '../models/Conversation.js'
import * as convService from '../services/conversation.service.js'

const socketsByUser = new Map() // userId -> Set<ws>
const socketUser = new Map() // ws -> userId
const graceTimers = new Map() // userId -> timer

function broadcastPresence(userId, online, lastSeenAt) {
  // broadcast to all connected users for simplicity
  for (const [uid, set] of socketsByUser.entries()) {
    if (uid === userId) continue
    for (const ws of set) {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'presence:update', userId, online, lastSeenAt }))
      }
    }
  }
}

async function markOffline(userId) {
  if (socketsByUser.get(userId)?.size) return
  const lastSeenAt = new Date()
  await User.findByIdAndUpdate(userId, { lastSeenAt })
  broadcastPresence(userId, false, lastSeenAt)
}

export function attachWebSocket(server, config) {
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws) => {
    let authenticated = false
    let userId = null

    const authTimeout = setTimeout(() => {
      if (!authenticated) ws.close(4001, 'auth timeout')
    }, 5000)

    ws.on('message', async (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }
      if (!authenticated) {
        if (msg.type !== 'auth' || !msg.token) { ws.close(4001, 'auth required'); return }
        try {
          const payload = jwt.verify(msg.token, config.JWT_ACCESS_SECRET)
          userId = payload.sub
          authenticated = true
          clearTimeout(authTimeout)

          if (graceTimers.has(userId)) { clearTimeout(graceTimers.get(userId)); graceTimers.delete(userId) }

          if (!socketsByUser.has(userId)) socketsByUser.set(userId, new Set())
          socketsByUser.get(userId).add(ws)
          socketUser.set(ws, userId)

          // presence snapshot: all users
          const users = await User.find({}).select('_id lastSeenAt privacy')
          const snapshot = users
            .filter((u) => String(u._id) !== userId)
            .map((u) => ({
              userId: String(u._id),
              online: socketsByUser.has(String(u._id)) && socketsByUser.get(String(u._id)).size > 0,
              lastSeenAt: u.lastSeenAt,
            }))
          ws.send(JSON.stringify({ type: 'presence:snapshot', users: snapshot }))

          // notify others online
          const alreadyOnline = socketsByUser.get(userId).size > 1
          if (!alreadyOnline) broadcastPresence(userId, true)
        } catch {
          ws.close(4001, 'invalid token')
        }
        return
      }
      // echo ack for ping
      // message send
      if (msg.type === 'message:send') {
        const { conversationId, clientId, type, text, uploadIds } = msg
        if (!mongoose.isValidObjectId(conversationId)) { ws.send(JSON.stringify({ type: 'ack', ok: false, error: 'bad id' })); return }
        const conv = await Conversation.findById(conversationId)
        if (!conv || !conv.participants.some((p) => String(p.user) === userId)) {
          ws.send(JSON.stringify({ type: 'ack', ok: false, error: 'forbidden' })); return
        }
        // dedupe
        const existing = await (await import('../models/Message.js')).Message.findOne({ conversation: conversationId, sender: userId, clientId })
        let message
        if (existing) message = existing.toObject()
        else message = await convService.createMessage({ conversationId, sender: userId, type: type || 'text', text: text || '', clientId, uploadIds })
        ws.send(JSON.stringify({ type: 'ack', ok: true, message }))
        // broadcast to participants
        for (const p of conv.participants) {
          const uid = String(p.user)
          const set = socketsByUser.get(uid)
          if (set) for (const s of set) if (s !== ws && s.readyState === 1) s.send(JSON.stringify({ type: 'message:new', message }))
        }
        return
      }
      if (msg.type === 'typing:start' || msg.type === 'typing:stop') {
        const { conversationId } = msg
        const conv = await Conversation.findById(conversationId)
        if (!conv || !conv.participants.some((p) => String(p.user) === userId)) return
        for (const p of conv.participants) {
          const uid = String(p.user)
          if (uid === userId) continue
          const set = socketsByUser.get(uid)
          if (set) for (const s of set) if (s.readyState === 1) s.send(JSON.stringify({ type: 'typing:update', conversationId, userId, isTyping: msg.type === 'typing:start' }))
        }
        return
      }

      if (msg.type === 'message:delivered') {
        const { conversationId, messageId } = msg
        const conv = await Conversation.findById(conversationId)
        if (!conv) return
        const part = conv.participants.find((p) => String(p.user) === userId)
        if (part) { part.lastDeliveredMessage = messageId; await conv.save() }
        // broadcast status
        for (const p of conv.participants) {
          const uid = String(p.user)
          const set = socketsByUser.get(uid)
          if (set) for (const s of set) if (s.readyState === 1) s.send(JSON.stringify({ type: 'message:status', conversationId, userId, lastDeliveredMessage: messageId }))
        }
        return
      }

      if (msg.type === 'message:read') {
        const { conversationId, messageId } = msg
        const conv = await Conversation.findById(conversationId)
        if (!conv) return
        const part = conv.participants.find((p) => String(p.user) === userId)
        if (part) { part.lastReadMessage = messageId; await conv.save() }
        for (const p of conv.participants) {
          const uid = String(p.user)
          const set = socketsByUser.get(uid)
          if (set) for (const s of set) if (s.readyState === 1) s.send(JSON.stringify({ type: 'message:status', conversationId, userId, lastReadMessage: messageId }))
        }
        return
      }

      if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }))
    })

    ws.on('close', () => {
      clearTimeout(authTimeout)
      const uid = socketUser.get(ws)
      if (!uid) return
      socketUser.delete(ws)
      const set = socketsByUser.get(uid)
      if (set) {
        set.delete(ws)
        if (set.size === 0) {
          socketsByUser.delete(uid)
          const timer = setTimeout(() => { markOffline(uid); graceTimers.delete(uid) }, 10000)
          graceTimers.set(uid, timer)
        }
      }
    })
  })

  return wss
}
