import { createServer } from 'node:http'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { createApp } from '../../src/app.js'
import { attachSocketIO } from '../../src/sockets/index.js'
import { makeTestConfig } from '../helpers/config.js'
import { assertTestDatabaseName } from '../helpers/db.js'
import { createDirectConversation, createUser } from '../helpers/factories.js'

// Runs the real app in its own process so load/soak tests can measure server CPU
// and memory without the client sockets inflating the same heap.

const dbName = `chatsphere_test_load_${Date.now()}`
assertTestDatabaseName(dbName)

const mongo = await MongoMemoryServer.create({ instance: { dbName } })
await mongoose.connect(mongo.getUri(dbName), { dbName })

const config = makeTestConfig({
  allowedOrigins: ['http://127.0.0.1:5175', 'http://localhost:5175'],
})
const app = createApp(config)
const mainServer = createServer(app)
const io = attachSocketIO(mainServer, config)

await new Promise((resolve, reject) => {
  mainServer.once('error', reject)
  mainServer.listen(Number(process.env.LOAD_PORT || 0), '127.0.0.1', resolve)
})
const mainUrl = `http://127.0.0.1:${mainServer.address().port}`

function metrics() {
  global.gc?.()
  const memory = process.memoryUsage()
  const cpu = process.cpuUsage()
  return {
    at: Date.now(),
    uptimeSec: process.uptime(),
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    heapTotal: memory.heapTotal,
    external: memory.external,
    cpuUser: cpu.user,
    cpuSystem: cpu.system,
    sockets: io.engine.clientsCount,
  }
}

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

let shuttingDown = false
async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  await new Promise((resolve) => io.close(resolve))
  if (mainServer.listening) await new Promise((resolve) => mainServer.close(resolve))
  await new Promise((resolve) => controlServer.close(resolve))
  await mongoose.disconnect()
  await mongo.stop()
  process.exit(0)
}

const controlServer = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const reply = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  try {
    if (req.method === 'GET' && url.pathname === '/metrics') {
      reply(200, metrics())
      return
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      reply(200, { ok: true })
      return
    }

    if (req.method === 'POST' && url.pathname === '/seed-pairs') {
      const { pairs = 50 } = await readJson(req)
      const seeded = []
      for (let index = 0; index < pairs; index += 1) {
        const userA = await createUser(config, { username: `load_a_${index}_${Date.now()}` })
        const userB = await createUser(config, { username: `load_b_${index}_${Date.now()}` })
        const conversation = await createDirectConversation(userA.user, userB.user)
        seeded.push({
          conversationId: String(conversation._id),
          users: [
            { id: String(userA.user._id), token: userA.token },
            { id: String(userB.user._id), token: userB.token },
          ],
        })
      }
      reply(200, { pairs: seeded })
      return
    }

    if (req.method === 'POST' && url.pathname === '/shutdown') {
      reply(200, { ok: true })
      setTimeout(() => {
        shutdown().catch(() => process.exit(1))
      }, 50)
      return
    }

    reply(404, { error: 'not found' })
  } catch (error) {
    reply(500, { error: error.message })
  }
})

await new Promise((resolve, reject) => {
  controlServer.once('error', reject)
  controlServer.listen(Number(process.env.LOAD_CONTROL_PORT || 0), '127.0.0.1', resolve)
})
const controlUrl = `http://127.0.0.1:${controlServer.address().port}`

console.log(`READY ${JSON.stringify({ url: mainUrl, controlUrl })}`)

process.on('SIGINT', () => {
  shutdown().catch(() => process.exit(1))
})
process.on('SIGTERM', () => {
  shutdown().catch(() => process.exit(1))
})
