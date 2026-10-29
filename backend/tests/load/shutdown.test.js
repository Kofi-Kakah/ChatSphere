import { createServer } from 'node:http'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { io as connectClient } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { attachSocketIO } from '../../src/sockets/index.js'
import { makeTestConfig } from '../helpers/config.js'
import { startTestDatabase } from '../helpers/db.js'

// Testing.md 6.4: "server restart: reconnect, room rejoin, resync". The restart
// simulation in the E2E harness closes the Socket.IO server explicitly, while
// src/index.js shutdown only calls server.close(). This measures that shape.

let db
let config

function waitFor(socket, event) {
  return new Promise((resolve, reject) => {
    socket.once(event, resolve)
    socket.once('connect_error', reject)
  })
}

async function buildServer() {
  const server = createServer(createApp(config))
  const io = attachSocketIO(server, config)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, io, url: `http://127.0.0.1:${server.address().port}` }
}

function closeWithin(server, ms) {
  let timer
  const closed = new Promise((resolve) => server.close(() => resolve('closed')))
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms)
  })
  return Promise.race([closed, timeout]).finally(() => clearTimeout(timer))
}

beforeAll(async () => {
  db = await startTestDatabase('shutdown')
  config = makeTestConfig({ MONGODB_URI: db.uri })
})

afterAll(async () => {
  await db?.stop()
})

describe('PERF-006b: server shutdown with live sockets', () => {
  it('a server with no connected clients closes immediately', async () => {
    const { server, io } = await buildServer()
    const startedAt = Date.now()
    const result = await closeWithin(server, 10_000)
    const elapsedMs = Date.now() - startedAt
    console.log(`[perf-006b] idle close -> ${result} in ${elapsedMs} ms`)
    io.close()
    server.closeAllConnections?.()
    expect(result).toBe('closed')
  }, 30_000)

  it.fails('BUG-092: server.close() completes within 10 s while a socket client is connected', async () => {
    const { server, io, url } = await buildServer()
    const token = jwt.sign({ sub: String(new mongoose.Types.ObjectId()) }, config.JWT_ACCESS_SECRET)
    const client = connectClient(url, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      autoConnect: false,
    })
    const snapshot = waitFor(client, 'presence:snapshot')
    client.connect()
    await snapshot

    const startedAt = Date.now()
    const result = await closeWithin(server, 10_000)
    const elapsedMs = Date.now() - startedAt
    console.log(`[perf-006b] close with 1 socket -> ${result} in ${elapsedMs} ms`)

    client.disconnect()
    io.close()
    server.closeAllConnections?.()
    expect(result).toBe('closed')
  }, 30_000)
})
