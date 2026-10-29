import { createServer } from 'node:http'
import { createApp } from '../../src/app.js'
import { attachSocketIO } from '../../src/sockets/index.js'
import { makeTestConfig } from './config.js'

export function createTestApp(overrides = {}) {
  const config = makeTestConfig(overrides)
  return { app: createApp(config), config }
}

export async function startTestServer(overrides = {}) {
  const config = makeTestConfig(overrides)
  const app = createApp(config)
  const server = createServer(app)
  const io = attachSocketIO(server, config)

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const { port } = server.address()

  return {
    app,
    config,
    server,
    io,
    port,
    url: `http://127.0.0.1:${port}`,
    async stop() {
      await new Promise((resolve) => io.close(resolve))
      if (server.listening) {
        await new Promise((resolve) => server.close(resolve))
      }
    },
  }
}
