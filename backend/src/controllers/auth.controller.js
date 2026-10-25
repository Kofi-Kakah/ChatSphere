import { registerSchema, loginSchema } from '../validation/auth.js'
import * as authService from '../services/auth.service.js'

function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  })
}

export async function register(req, res, next) {
  try {
    const data = registerSchema.parse(req.body)
    const result = await authService.registerUser(data, req.app.locals.config)
    setRefreshCookie(res, result.refreshToken)
    res.status(201).json({ user: result.user, accessToken: result.accessToken })
  } catch (e) { next(e) }
}

export async function login(req, res, next) {
  try {
    const data = loginSchema.parse(req.body)
    const result = await authService.loginUser(data, req.app.locals.config)
    setRefreshCookie(res, result.refreshToken)
    res.json({ user: result.user, accessToken: result.accessToken })
  } catch (e) { next(e) }
}

export async function refresh(req, res, next) {
  try {
    const token = req.cookies?.refreshToken
    const result = await authService.refreshTokens(token, req.app.locals.config, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    })
    setRefreshCookie(res, result.refreshToken)
    res.json({ user: result.user, accessToken: result.accessToken })
  } catch (e) { next(e) }
}

export async function logout(req, res, next) {
  try {
    await authService.logoutUser(req.cookies?.refreshToken)
    res.clearCookie('refreshToken', { path: '/api/auth' })
    res.status(204).end()
  } catch (e) { next(e) }
}

export async function me(req, res, next) {
  try {
    const user = await authService.getUserById(req.userId)
    res.json({ user })
  } catch (e) { next(e) }
}
