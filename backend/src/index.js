import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { loadConfig } from './config/env.js'
import { connectDatabase, disconnectDatabase } from './config/database.js'
import { logger } from './utils/logger.js'
import { attachWebSocket } from './sockets/index.js'

export async function startServer(config = loadConfig()) {
  await connectDatabase(config.MONGODB_URI)

  const server = createServer(createApp(config))
  attachWebSocket(server, config)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.PORT, resolve)
  })

  logger.info('server_started', { port: config.PORT, environment: config.NODE_ENV })

  const shutdown = async (signal) => {
    logger.info('server_stopping', { signal })
    server.close(async () => {
      await disconnectDatabase()
      process.exit(0)
    })
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  return server
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await startServer()
  } catch {
    logger.error('server_start_failed')
    process.exitCode = 1
  }
}
