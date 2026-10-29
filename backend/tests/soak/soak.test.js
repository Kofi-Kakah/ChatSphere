import { describe, expect, it } from 'vitest'
import { disconnectAll, drainPresenceGrace, openSocket, waitForConnect, waitForEvent } from '../helpers/socket.js'
import { cpuPercent, getMetrics, mb, seedPairs, startLoadServer } from '../load/helpers.js'

// Testing.md 6.4: a 30-minute soak with steady traffic must not leak memory.
// Opt-in: `npm run test:soak` (not part of test:all).

const MINUTES = Number(process.env.SOAK_MINUTES || 30)
const SEND_INTERVAL_MS = Number(process.env.SOAK_SEND_INTERVAL_MS || 2_000)
const SAMPLE_INTERVAL_MS = Number(process.env.SOAK_SAMPLE_INTERVAL_MS || 60_000)
const PAIRS = Number(process.env.SOAK_PAIRS || 50)
const WARMUP_MS = Number(process.env.SOAK_WARMUP_MS || 120_000)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
}

function growthPercent(from, to) {
  return from === 0 ? 0 : ((to - from) / from) * 100
}

describe(`soak: ${MINUTES} minutes with ${PAIRS} sockets`, () => {
  it(
    'steady message traffic does not grow heap or RSS beyond the leak budget',
    async () => {
      const server = await startLoadServer()
      try {
        const seeded = await seedPairs(server.controlUrl, PAIRS)
        const startedAt = Date.now()
        const deadline = startedAt + MINUTES * 60_000

        const sockets = []
        for (const pair of seeded) {
          const socket = openSocket(server.url, pair.users[0].token, { timeout: 120_000 })
          const snapshot = waitForEvent(socket, 'presence:snapshot', { timeout: 120_000 })
          await waitForConnect(socket, 120_000)
          await snapshot
          sockets.push({ socket, conversationId: pair.conversationId, index: sockets.length })
        }

        const failures = []
        let sent = 0
        let stopping = false
        const senders = sockets.map(async ({ socket, conversationId, index }) => {
          let sequence = 0
          while (!stopping && Date.now() < deadline) {
            try {
              const ack = await new Promise((resolve, reject) => {
                socket.timeout(15_000).emit(
                  'message:send',
                  {
                    conversationId,
                    clientId: `soak-${index}-${sequence}`,
                    type: 'text',
                    text: `soak ${index}-${sequence}`,
                  },
                  (error, response) => (error ? reject(error) : resolve(response)),
                )
              })
              if (!ack?.ok) failures.push({ index, sequence, ack })
              else sent += 1
            } catch (error) {
              failures.push({ index, sequence, error: String(error?.message || error) })
            }
            sequence += 1
            await sleep(SEND_INTERVAL_MS)
          }
        })

        const samples = []
        let sampling = true
        const sampler = (async () => {
          while (sampling) {
            samples.push(await getMetrics(server.controlUrl))
            if (Date.now() >= deadline) break
            await sleep(Math.min(SAMPLE_INTERVAL_MS, Math.max(deadline - Date.now(), 1_000)))
          }
        })()

        await Promise.all(senders)
        stopping = true
        await sampler
        sampling = false

        const warmupSamples = samples.filter((sample) => sample.at - startedAt >= WARMUP_MS)
        const steadySamples = warmupSamples.slice(0, Math.max(1, Math.min(3, warmupSamples.length)))
        const finalSamples = samples.slice(-3)
        const steady = {
          heapUsed: mean(steadySamples.map((sample) => sample.heapUsed)),
          rss: mean(steadySamples.map((sample) => sample.rss)),
        }
        const final = {
          heapUsed: mean(finalSamples.map((sample) => sample.heapUsed)),
          rss: mean(finalSamples.map((sample) => sample.rss)),
        }
        const cpu = samples.slice(1).map((sample, index) => cpuPercent(samples[index], sample))

        const summary = {
          minutes: MINUTES,
          sockets: sockets.length,
          messagesSent: sent,
          failures: failures.length,
          samples: samples.length,
          heapUsedMb: { steady: mb(steady.heapUsed), final: mb(final.heapUsed), growthPercent: Math.round(growthPercent(steady.heapUsed, final.heapUsed) * 10) / 10 },
          rssMb: { steady: mb(steady.rss), final: mb(final.rss), growthPercent: Math.round(growthPercent(steady.rss, final.rss) * 10) / 10 },
          cpuPercentMean: Math.round(mean(cpu) * 10) / 10,
        }
        console.log(`[soak] ${JSON.stringify(summary)}`)
        console.log(`[soak] samples ${JSON.stringify(samples.map((sample) => ({ t: Math.round((sample.at - startedAt) / 1000), rss: mb(sample.rss), heapUsed: mb(sample.heapUsed), sockets: sample.sockets })))}`)

        disconnectAll(sockets.map((entry) => entry.socket))
        await drainPresenceGrace()

        expect(failures).toEqual([])
        expect(summary.heapUsedMb.growthPercent).toBeLessThan(50)
        expect(summary.rssMb.growthPercent).toBeLessThan(30)
        expect(samples.at(-1).sockets).toBe(sockets.length)
      } finally {
        await server.stop()
      }
    },
    (MINUTES + 3) * 60_000,
  )
})
