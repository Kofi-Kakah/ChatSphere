// Testing.md 6.4 (PERF-007): production-bundle paint and transfer numbers for
// the sign-in screen and the chat list. Lighthouse CLI is not installed in this
// repo and adding a dependency needs approval, so this uses the Chromium
// DevTools paint/LCP entries through Playwright against `vite preview`.
import { chromium } from '@playwright/test'

const APP_URL = process.env.PERF_APP_URL || 'http://127.0.0.1:4173'
const API_URL = process.env.PERF_API_URL || 'http://127.0.0.1:3101/api'

const suffix = `${Date.now()}`.slice(-9)
const alice = {
  username: `perfa${suffix}`,
  email: `perf.a.${suffix}@example.test`,
  displayName: 'Perf A',
  password: `Perf!Pass${suffix}`,
}
const bob = {
  username: `perfb${suffix}`,
  email: `perf.b.${suffix}@example.test`,
  displayName: 'Perf B',
  password: `Perf!Pass${suffix}`,
}

async function register(request, user) {
  const response = await request.post(`${API_URL}/auth/register`, { data: user })
  if (!response.ok()) throw new Error(`register failed: ${response.status()} ${await response.text()}`)
  return response.json()
}

async function collectPaint(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const nav = performance.getEntriesByType('navigation')[0]
        const paints = Object.fromEntries(
          performance.getEntriesByType('paint').map((entry) => [entry.name, Math.round(entry.startTime)]),
        )
        const resources = performance.getEntriesByType('resource')
        const scripts = resources.filter((entry) => /\.js(\?|$)/.test(entry.name))
        const result = {
          domContentLoadedMs: Math.round(nav?.domContentLoadedEventEnd || 0),
          loadMs: Math.round(nav?.loadEventEnd || 0),
          firstPaintMs: paints['first-paint'] ?? null,
          firstContentfulPaintMs: paints['first-contentful-paint'] ?? null,
          requestCount: resources.length,
          transferKb: Math.round(resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0) / 1024),
          jsTransferKb: Math.round(scripts.reduce((sum, entry) => sum + (entry.transferSize || 0), 0) / 1024),
          jsChunks: scripts.map((entry) => entry.name.split('/').pop()),
        }
        let done = false
        const finish = (lcp) => {
          if (done) return
          done = true
          resolve({ ...result, largestContentfulPaintMs: lcp })
        }
        try {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries()
            const last = entries[entries.length - 1]
            if (last) {
              observer.disconnect()
              finish(Math.round(last.startTime))
            }
          })
          observer.observe({ type: 'largest-contentful-paint', buffered: true })
          // Fallback window only; buffered entries normally arrive immediately.
          setTimeout(() => finish(null), 1_000)
        } catch {
          finish(null)
        }
      }),
  )
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })

try {
  const registration = await register(context.request, alice)
  const bobRegistration = await register(context.request, bob)
  const other = bobRegistration.user
  const conversationResponse = await context.request.post(`${API_URL}/conversations/direct`, {
    headers: { Authorization: `Bearer ${registration.accessToken}` },
    data: { userId: other._id },
  })
  if (!conversationResponse.ok()) throw new Error(`conversation failed: ${conversationResponse.status()}`)

  const requests = []
  context.on('request', (request) => {
    if (/\.js(\?|$)/.test(request.url())) requests.push(request.url().split('/').pop())
  })

  const page = await context.newPage()
  await page.goto(`${APP_URL}/login`, { waitUntil: 'load' })
  await page.waitForSelector('input[placeholder="Email or username"]')
  const login = await collectPaint(page)

  const loginStartedAt = Date.now()
  await page.getByPlaceholder('Email or username').fill(alice.username)
  await page.getByPlaceholder('Password').fill(alice.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(`${APP_URL}/`)
  await page.waitForSelector('aside')
  const loginToAppMs = Date.now() - loginStartedAt

  const chatStartedAt = Date.now()
  await page.locator('aside .cursor-pointer').first().click()
  const composer = await page
    .getByPlaceholder('Type a message')
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false)
  const chatOpenMs = Date.now() - chatStartedAt

  const beforeEmoji = requests.length
  await page.getByRole('button', { name: '🙂' }).click()
  await page.waitForSelector('[role="textbox"][aria-label="Type to search for an emoji"]', { timeout: 30_000 }).catch(() => null)
  const emojiChunks = requests.slice(beforeEmoji)

  console.log(`[perf-build] ${JSON.stringify({ appUrl: APP_URL, login, loginToAppMs, chatOpenMs, composerVisible: composer, emojiChunks })}`)
} finally {
  await context.close()
  await browser.close()
}
