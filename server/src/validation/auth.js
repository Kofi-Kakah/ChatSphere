import { z } from 'zod'

export const registerSchema = z.object({
  username: z.string().regex(/^[a-z0-9_]{3,20}$/),
  email: z.string().email(),
  displayName: z.string().min(1).max(50),
  password: z.string().min(8).max(128),
})

export const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
})
