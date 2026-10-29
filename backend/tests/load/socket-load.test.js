import { describe, expect, it } from 'vitest'
import { disconnectAll, drainPresenceGrace, openSocket, waitForConnect, waitForEvent } from '../helpers/socket.js'
import { cpuPercent, getMetrics, mb, percentile, seedPairs, startLoadServer } from './helpers.js'

// Testing.md 6.4: 100 then 500 concurrent sockets sending messages. The server
// runs in a child process so its CPU and memory are not polluted by the clients.

const SENDS_PER_SOCKET = 2

async function connectBatch(url, entries, batchSize = 50, timeout = 120_000) {
  const sockets = []
  for (let start = 0; start < entries.length; start += batchSize) {
    const batch = entries.slice(start, start + batchSize)
    const connected = await Promise.all(
      batch.map(async ({ token }) => {
        const socket = openSocket(url, token, { timeout })
        const snapshot = waitForEvent(socket, 'presence:snapshot', { timeout })
        await waitForConnect(socket, timeout)
        await snapshot
        return socket
      }),
    )
    sockets.push(...connected)
  }
  return sockets
}

async function runLoad({ label, pairs, sendsPerSocket = SENDS_PER_SOCKET }) {
  const server = await startLoadServer()
  try {
    const seeded = await seedPairs(server.controlUrl, pairs)
    const baseline = await getMetrics(server.controlUrl)

    const entries = seeded.flatMap((pair) =>
      pair.users.map((user) => ({ ...user, conversationId: pair.conversationId })),
    )
    const connectStartedAt = Date.now()
    const sockets = await connectBatch(server.url, entries)
    const connectMs = Date.now() - connectStartedAt
    const afterConnect = await getMetrics(server.controlUrl)

    const latencies = []
    const failures = []
    const sendStartedAt = Date.now()
    await Promise.all(
      sockets.map(async (socket, index) => {
        const { conversationId } = entries[index]
        for (let send = 0; send < sendsPerSocket; send += 1) {
          const startedAt = performance.now()
          try {
            const ack = await new Promise((resolve, reject) => {
              socket.timeout(15_000).emit(
                'message:send',
                {
                  conversationId,
                  clientId: `load-${label}-${index}-${send}`,
                  type: 'text',
                  text: `${label} message ${index}-${send}`,
                },
                (error, response) => (error ? reject(error) : resolve(response)),
              )
            })
            latencies.push(performance.now() - startedAt)
            if (!ack?.ok) failures.push({ index, send, ack })
          } catch (error) {
            failures.push({ index, send, error: String(error?.message || error) })
          }
        }
      }),
    )
    const sendMs = Date.now() - sendStartedAt
    const afterSend = await getMetrics(server.controlUrl)

    const summary = {
      label,
      sockets: sockets.length,
      pairs,
      messages: sockets.length * sendsPerSocket,
      connectMs,
      sendMs,
      p50Ms: Math.round(percentile(latencies, 50)),
      p95Ms: Math.round(percentile(latencies, 95)),
      maxMs: Math.round(Math.max(...latencies)),
      failures: failures.length,
      errorRate: Number((failures.length / Math.max(latencies.length + failures.length, 1)).toFixed(4)),
      serverCpuPercentDuringSend: Math.round(cpuPercent(afterConnect, afterSend) * 10) / 10,
      rssMb: { baseline: mb(baseline.rss), afterConnect: mb(afterConnect.rss), afterSend: mb(afterSend.rss) },
      heapUsedMb: {
        baseline: mb(baseline.heapUsed),
        afterConnect: mb(afterConnect.heapUsed),
        afterSend: mb(afterSend.heapUsed),
      },
      socketsReportedByServer: afterSend.sockets,
    }
    console.log(`[load] ${JSON.stringify(summary)}`)

    disconnectAll(sockets)
    await drainPresenceGrace()

    expect(summary.socketsReportedByServer).toBe(sockets.length)
    expect(failures).toEqual([])
    // Testing.md 6.4 asks for the numbers, not a latency target. This ceiling is
    // a hang guard only; the reported p50/p95 are the deliverable.
    expect(summary.p95Ms).toBeLessThan(10_000)
    return summary
  } finally {
    await server.stop()
  }
}

describe('socket load: 100 and 500 concurrent clients', () => {
  it('100 concurrent sockets send messages with p50/p95, errors, CPU, and memory recorded', async () => {
    const summary = await runLoad({ label: 'load-100', pairs: 50 })
    expect(summary.sockets).toBe(100)
    expect(summary.messages).toBe(100 * SENDS_PER_SOCKET)
  }, 300_000)

  it('500 concurrent sockets send messages with p50/p95, errors, CPU, and memory recorded', async () => {
    const summary = await runLoad({ label: 'load-500', pairs: 250 })
    expect(summary.sockets).toBe(500)
    expect(summary.messages).toBe(500 * SENDS_PER_SOCKET)
  }, 420_000)
})
