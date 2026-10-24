import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  MONGODB_URI: z.string().min(1).refine(
    (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
    'MONGODB_URI must use mongodb:// or mongodb+srv://',
  ),
})

export function loadConfig(env = process.env) {
  const result = envSchema.safeParse(env)

  if (!result.success) {
    const details = result.error.issues
      .map(({ path, message }) => `${path.join('.')}: ${message}`)
      .join('; ')
    throw new Error(`Invalid server configuration: ${details}`)
  }

  return {
    ...result.data,
    allowedOrigins: result.data.CLIENT_ORIGIN.split(',').map((origin) => origin.trim()),
  }
}
