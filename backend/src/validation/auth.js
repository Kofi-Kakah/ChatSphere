import { z } from 'zod'

export const registerSchema = z.object({
  username: z.string().min(3).max(20).refine((v) => (v.match(/\d/g) || []).length >= 2, 'Username must contain at least two numbers'),
  email: z.string().email(),
  displayName: z.string().min(1).max(50),
  password: z.string().min(8).max(128),
})

export const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
})
