import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const serverPath = fileURLToPath(new URL('../harness/load-server.js', import.meta.url))

export async function startLoadServer(env = {}) {
  const child = spawn(process.execPath, ['--expose-gc', serverPath], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')

  let stdout = ''
  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`load server did not start in 120s. stderr: ${stderr.slice(-2000)}`))
    }, 120_000)
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      const match = stdout.match(/^READY (.+)$/m)
      if (match) {
        clearTimeout(timer)
        try {
          resolve(JSON.parse(match[1]))
        } catch (error) {
          reject(error)
        }
      }
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`load server exited early with ${code}. stderr: ${stderr.slice(-2000)}`))
    })
  })

  const info = await ready
  return {
    ...info,
    child,
    stderr: () => stderr,
    async stop() {
      try {
        await fetch(`${info.controlUrl}/shutdown`, { method: 'POST' })
      } catch {
        child.kill()
      }
      await new Promise((resolve) => {
        if (child.exitCode !== null) return resolve()
        const timer = setTimeout(() => {
          child.kill()
          resolve()
        }, 30_000)
        child.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
      })
    },
  }
}

export async function getMetrics(controlUrl) {
  const response = await fetch(`${controlUrl}/metrics`)
  if (!response.ok) throw new Error(`metrics failed: ${response.status}`)
  return response.json()
}

export async function seedPairs(controlUrl, pairs) {
  const response = await fetch(`${controlUrl}/seed-pairs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pairs }),
  })
  if (!response.ok) throw new Error(`seed-pairs failed: ${response.status} ${await response.text()}`)
  return (await response.json()).pairs
}

export function percentile(values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)]
}

export function cpuPercent(before, after) {
  const cpuMicros = after.cpuUser + after.cpuSystem - (before.cpuUser + before.cpuSystem)
  const wallMs = after.at - before.at
  return (cpuMicros / 1000 / wallMs) * 100
}

export function mb(bytes) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10
}
