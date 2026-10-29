// The control surface lives on the E2E harness process (port 3102), separate
// from the app on 3101 so production middleware stays untouched.
const CONTROL_BASE = 'http://127.0.0.1:3102'

export async function seedMessages(request, conversationId, count) {
  const response = await request.post(`${CONTROL_BASE}/seed-messages`, {
    data: { conversationId, count },
    timeout: 120_000,
  })
  if (!response.ok()) throw new Error(`seed-messages failed: ${response.status()} ${await response.text()}`)
  return response.json()
}

export async function restartMainServer(request) {
  const response = await request.post(`${CONTROL_BASE}/restart-main`, { timeout: 60_000 })
  if (!response.ok()) throw new Error(`restart-main failed: ${response.status()} ${await response.text()}`)
  return response.json()
}

export async function createHeapSession(page) {
  const session = await page.context().newCDPSession(page)
  await session.send('HeapProfiler.enable')
  return session
}

export async function heapUsedBytes(session) {
  await session.send('HeapProfiler.collectGarbage')
  const { usedSize } = await session.send('Runtime.getHeapUsage')
  return usedSize
}

export async function trackObjectUrls(page) {
  const install = () => {
    if (window.__objectUrls) return
    const state = { created: 0, revoked: 0, live: new Set() }
    window.__objectUrls = state
    const create = URL.createObjectURL.bind(URL)
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (blob) => {
      const url = create(blob)
      state.created += 1
      state.live.add(url)
      return url
    }
    URL.revokeObjectURL = (url) => {
      state.revoked += 1
      state.live.delete(url)
      return revoke(url)
    }
  }
  await page.addInitScript(install)
  await page.evaluate(install)
}

export async function objectUrlStats(page) {
  return page.evaluate(() => ({
    created: window.__objectUrls?.created ?? 0,
    revoked: window.__objectUrls?.revoked ?? 0,
    live: window.__objectUrls?.live?.size ?? 0,
  }))
}

// CDP offline blocks new connections but does not reliably close an established
// WebSocket, so the client is told to drop the transport; the socket.io client
// then retries on its own schedule and fails while offline.
export async function dropTransport(page) {
  await page.evaluate(() => {
    window.__socket?.io?.engine?.close()
  })
}

export async function bubbleCount(page) {
  return page.locator('[data-message-id]').count()
}

export async function domNodeCount(page, scope = 'main') {
  return page.locator(`${scope} *`).count()
}

export async function messageIds(page) {
  return page.locator('[data-message-id]').evaluateAll((nodes) => nodes.map((node) => node.dataset.messageId))
}

export async function bannerShown(page) {
  return page.getByText('Reconnecting…').isVisible().catch(() => false)
}

export async function waitForBanner(page, visible, timeout = 20_000) {
  const banner = page.getByText('Reconnecting…')
  if (visible) {
    await banner.waitFor({ state: 'visible', timeout })
    return
  }
  await banner.waitFor({ state: 'hidden', timeout })
}

export function mb(bytes) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10
}
