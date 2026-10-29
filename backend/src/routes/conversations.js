import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import * as conv from '../services/conversation.service.js'
import { Conversation } from '../models/Conversation.js'
import mongoose from 'mongoose'

const router = Router()

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const list = await conv.listConversations(req.userId)
    res.json({ conversations: list })
  } catch (e) { next(e) }
})

router.post('/direct', requireAuth, async (req, res, next) => {
  try {
    const { userId } = req.body
    if (!mongoose.isValidObjectId(userId)) { const err = new Error('bad id'); err.status = 400; throw err }
    const c = await conv.findOrCreateDirect(req.userId, userId)
    res.status(201).json({ conversation: c })
  } catch (e) { next(e) }
})

router.post('/group', requireAuth, async (req, res, next) => {
  try {
    const { name, memberIds } = req.body
    if (!name || !Array.isArray(memberIds) || memberIds.length < 2) { const err = new Error('invalid'); err.status = 400; throw err }
    const c = await conv.createGroup({ name, memberIds, creatorId: req.userId })
    res.status(201).json({ conversation: c })
  } catch (e) { next(e) }
})

router.post('/:id/members', requireAuth, async (req, res, next) => {
  try {
    const { userIds } = req.body
    const c = await conv.addMembers(req.params.id, userIds, req.userId)
    res.json({ conversation: c })
  } catch (e) { next(e) }
})

router.delete('/:id/members/:userId', requireAuth, async (req, res, next) => {
  try {
    const c = await conv.removeMember(req.params.id, req.params.userId, req.userId)
    res.json({ conversation: c })
  } catch (e) { next(e) }
})

router.post('/:id/leave', requireAuth, async (req, res, next) => {
  try {
    const c = await conv.leaveGroup(req.params.id, req.userId)
    res.json({ conversation: c })
  } catch (e) { next(e) }
})

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const conv = await Conversation.findById(req.params.id)
    if (!conv) { const err = new Error('not found'); err.status = 404; throw err }
    const isMember = conv.participants.some((p) => String(p.user) === String(req.userId))
    if (!isMember) { const err = new Error('forbidden'); err.status = 403; throw err }
    const { name, avatarUrl, theme } = req.body || {}
    if (name !== undefined) conv.name = name
    if (avatarUrl !== undefined) conv.avatarUrl = avatarUrl
    if (theme !== undefined) {
      conv.theme = theme
      await conv.save()
      await convService.createMessage({ conversationId: conv._id, sender: req.userId, type: 'system', text: `Theme changed to ${theme}` })
    } else {
      await conv.save()
    }
    res.json({ conversation: conv })
  } catch (e) { next(e) }
})
router.get('/:id/media', requireAuth, async (req, res, next) => {
  try {
    const media = await conv.listMedia(req.params.id, req.userId, {
      type: req.query.type,
      before: req.query.before,
      limit: req.query.limit,
    })
    res.json({ media })
  } catch (e) { next(e) }
})

router.get('/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const msgs = await conv.getMessages(req.params.id, req.userId, {
      before: req.query.before,
      limit: req.query.limit,
    })
    res.json({ messages: msgs })
  } catch (e) { next(e) }
})

export default router
