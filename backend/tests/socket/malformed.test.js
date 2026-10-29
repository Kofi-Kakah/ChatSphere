import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const probePath = fileURLToPath(new URL('../harness/socket-unhandled-probe.mjs', import.meta.url))
const mongoDownloadDir = fileURLToPath(new URL('../../.cache/mongodb-binaries/', import.meta.url))
const backendRoot = fileURLToPath(new URL('../../', import.meta.url))

describe('malformed socket payloads', () => {
  it.fails('BUG-025 / SEC-010: malformed event payloads are rejected without unhandled rejections', async () => {
    const result = await new Promise((resolve) => {
      execFile(
        process.execPath,
        [probePath],
        {
          cwd: backendRoot,
          timeout: 60_000,
          env: { ...process.env, MONGOMS_DOWNLOAD_DIR: mongoDownloadDir },
        },
        (error, stdout, stderr) => {
          resolve({
            code: error?.code ?? 0,
            stdout: String(stdout),
            stderr: String(stderr),
          })
        },
      )
    })

    expect(result.code, `probe output:\n${result.stdout}\n${result.stderr}`).toBe(0)
  })
})
