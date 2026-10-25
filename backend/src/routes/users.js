import { Router } from 'express'
import { User } from '../models/User.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/search', requireAuth, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim()
    if (!q) return res.json({ users: [] })
    const users = await User.find({ username: { $regex: q, $options: 'i' } }).limit(20).select('username displayName avatarUrl bio')
    res.json({ users })
  } catch (e) { next(e) }
})

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const u = await User.findById(req.params.id).select('username displayName avatarUrl bio createdAt privacy')
    if (!u) { const err = new Error('Not found'); err.status = 404; err.code = 'NOT_FOUND'; throw err }
    res.json({ user: u })
  } catch (e) { next(e) }
})

router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const { displayName, bio, username, privacy } = req.body || {}
    const u = await User.findById(req.userId)
    if (!u) { const err = new Error('Not found'); err.status = 404; throw err }
    if (displayName !== undefined) u.displayName = displayName
    if (bio !== undefined) u.bio = bio
    if (username !== undefined) {
      const exists = await User.findOne({ username, _id: { $ne: u._id } })
      if (exists) { const err = new Error('Username taken'); err.status = 409; err.code = 'CONFLICT'; throw err }
      u.username = username.toLowerCase()
    }
    if (privacy) u.privacy = { ...u.privacy.toObject?.(), ...privacy }
    await u.save()
    res.json({ user: u })
  } catch (e) { next(e) }
})

export default router
