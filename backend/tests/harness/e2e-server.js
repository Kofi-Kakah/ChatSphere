import { createServer } from 'node:http'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { createApp } from '../../src/app.js'
import { attachSocketIO } from '../../src/sockets/index.js'
import { Conversation } from '../../src/models/Conversation.js'
import { Message } from '../../src/models/Message.js'
import { makeTestConfig } from '../helpers/config.js'
import { assertTestDatabaseName } from '../helpers/db.js'

const port = Number(process.env.E2E_PORT || 3101)
const controlPort = Number(process.env.E2E_CONTROL_PORT || 3102)
const dbName = `chatsphere_test_e2e_${Date.now()}`
assertTestDatabaseName(dbName)

const mongo = await MongoMemoryServer.create({ instance: { dbName } })
const uri = mongo.getUri(dbName)
await mongoose.connect(uri, { dbName })

const config = makeTestConfig({
  PORT: port,
  allowedOrigins: ['http://127.0.0.1:5175', 'http://localhost:5175'],
})
const app = createApp(config)
// E2E-only: the app hard-codes 20 auth requests per 15 minutes per IP, which a
// multi-user suite cannot fit behind one loopback address. Rate limiting is
// covered by the backend API/socket suites; bypass the three REST limiter
// layers for E2E traffic only. Production code is untouched.
function bypassRestRateLimiters(expressApp) {
  const stack = (expressApp.router || expressApp._router).stack
  let bypassed = 0
  for (const layer of stack) {
    if (layer.name === 'router' || typeof layer.handle !== 'function') continue
    if (layer.handle.length !== 3 || layer.handle.name !== '') continue
    const matches =
      layer.matchers?.some((match) => typeof match === 'function' && match('/api/auth/login')) ||
      layer.matchers?.some((match) => typeof match === 'function' && match('/api/auth/register'))
    if (matches) {
      layer.handle = (req, res, next) => next()
      bypassed += 1
    }
  }
  if (bypassed !== 3) throw new Error(`expected 3 REST rate-limit layers, bypassed ${bypassed}`)
}
bypassRestRateLimiters(app)

let main = null

async function startMain() {
  const server = createServer(app)
  const io = attachSocketIO(server, config)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  main = { server, io }
  console.log(`[e2e-server] ready on http://127.0.0.1:${port} (db ${dbName})`)
  return main
}

async function stopMain() {
  if (!main) return
  const { server, io } = main
  main = null
  const startedAt = Date.now()
  const connected = io.sockets.sockets.size
  const closed = new Promise((resolve) => io.close(resolve))
  // io.close() closes the HTTP server, and that close callback waits for open
  // engine.io connections (a polling request can hold it for ~60 s). A process
  // restart does not wait, so drop the sockets to keep the simulation abrupt.
  server.closeAllConnections?.()
  await closed
  console.log(`[e2e-server] stopMain: io closed in ${Date.now() - startedAt} ms (${connected} sockets)`)
  if (server.listening) await new Promise((resolve) => server.close(resolve))
  console.log(`[e2e-server] stopMain: done in ${Date.now() - startedAt} ms`)
}

await startMain()

// E2E-only control surface on a second port so the production middleware chain
// (notFound/error handlers included) stays untouched. Never imported by src/.
function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('error', reject)
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
      } catch (error) {
        reject(error)
      }
    })
  })
}

const controlServer = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const reply = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      reply(200, { ok: true, mainUp: Boolean(main?.server?.listening) })
      return
    }

    if (req.method === 'POST' && url.pathname === '/seed-messages') {
      const { conversationId, count = 10_000 } = await readJson(req)
      if (!mongoose.isValidObjectId(conversationId)) {
        reply(400, { error: 'invalid conversationId' })
        return
      }
      const conversation = await Conversation.findById(conversationId)
      if (!conversation) {
        reply(404, { error: 'conversation not found' })
        return
      }
      const sender = conversation.participants[0].user
      const batchSize = 1_000
      for (let start = 0; start < count; start += batchSize) {
        const size = Math.min(batchSize, count - start)
        const docs = Array.from({ length: size }, (_, offset) => {
          const index = start + offset
          return {
            conversation: conversation._id,
            sender,
            type: 'text',
            text: `perf message ${String(index).padStart(5, '0')}`,
            clientId: `perf-${Date.now()}-${index}`,
          }
        })
        await Message.insertMany(docs, { ordered: true })
      }
      const last = await Message.findOne({ conversation: conversation._id }).sort({ _id: -1 }).lean()
      await Conversation.updateOne(
        { _id: conversation._id },
        {
          $set: {
            lastMessage: {
              id: last._id,
              sender: last.sender,
              type: last.type,
              text: last.text,
              createdAt: last.createdAt,
            },
            lastMessageAt: last.createdAt,
          },
        },
      )
      reply(200, { inserted: count, conversationId: String(conversation._id) })
      return
    }

    if (req.method === 'POST' && url.pathname === '/restart-main') {
      const closedAt = Date.now()
      await stopMain()
      console.log(`[e2e-server] restart: stopped after ${Date.now() - closedAt} ms`)
      await startMain()
      console.log(`[e2e-server] restart: started after ${Date.now() - closedAt} ms`)
      reply(200, { restarted: true, downtimeMs: Date.now() - closedAt })
      return
    }

    reply(404, { error: 'not found' })
  } catch (error) {
    reply(500, { error: error.message })
  }
})

await new Promise((resolve, reject) => {
  controlServer.once('error', reject)
  controlServer.listen(controlPort, '127.0.0.1', resolve)
})
console.log(`[e2e-server] control on http://127.0.0.1:${controlPort}`)

let shuttingDown = false
async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  await new Promise((resolve) => controlServer.close(resolve))
  await stopMain()
  await mongoose.disconnect()
  await mongo.stop()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
