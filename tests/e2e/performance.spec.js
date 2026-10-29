import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { authHeaders, closePair, createDirectViaApi, openUserContext, registerUser, seedMessagesThroughSocket, waitForSocket } from '../helpers/flows.js'
import { API_URL } from '../helpers/users.js'
import { setOffline, throttleSlow3G } from '../helpers/network.js'
import {
  bannerShown,
  bubbleCount,
  createHeapSession,
  domNodeCount,
  dropTransport,
  heapUsedBytes,
  mb,
  messageIds,
  objectUrlStats,
  restartMainServer,
  seedMessages,
  trackObjectUrls,
  waitForBanner,
} from '../helpers/performance.js'

// Testing.md 6.4. All measurements are Chromium-only: the harness uses CDP for
// heap numbers and network conditioning, and the seeded history would dominate
// the Firefox/WebKit runtime budget without adding measurement value.

test.describe.configure({ mode: 'serial' })

const validPng = readFileSync(fileURLToPath(new URL('../assets/valid.png', import.meta.url))).toString('base64')

function listRow(page, name) {
  return page.locator('aside .cursor-pointer').filter({ hasText: name })
}

async function openNamedConversation(page, name) {
  const row = listRow(page, name)
  await expect(row).toHaveCount(1)
  await row.click()
  await expect(page.locator('main header')).toContainText(name)
}

async function pastePng(page) {
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }))
    const target = document.querySelector('textarea')
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: transfer })
    target.dispatchEvent(event)
  }, validPng)
}

test.describe('performance and resilience (6.4)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Performance measurements use Chromium CDP')

  let pair
  let secondConversation

  test.beforeAll(async ({ browser, request }) => {
    // BUG-039: the access token lives in memory only, so a page reload logs the
    // user out. Everything must be ready before the contexts log in, since
    // Chats fetches the conversation list once on mount.
    const alice = await registerUser(request, 'perfa', 'Perf Alice')
    const bob = await registerUser(request, 'perfb', 'Perf Bob')
    const carol = await registerUser(request, 'perfc', 'Perf Carol')
    const conversation = await createDirectViaApi(request, alice, bob.user._id)
    secondConversation = await createDirectViaApi(request, alice, carol.user._id)

    for (const [target, name] of [
      [conversation, 'Perf History'],
      [secondConversation, 'Perf Other'],
    ]) {
      const renamed = await request.patch(`${API_URL}/conversations/${target._id}`, {
        headers: authHeaders(alice.accessToken),
        data: { name },
      })
      expect(renamed.ok()).toBeTruthy()
    }

    const a = await openUserContext(browser, alice.user)
    const b = await openUserContext(browser, bob.user)
    pair = { alice, bob, conversation, a, b }
    await trackObjectUrls(pair.a.page)
    await expect(listRow(pair.a.page, 'Perf History')).toHaveCount(1)
    await expect(listRow(pair.a.page, 'Perf Other')).toHaveCount(1)
  })

  test.afterAll(async () => {
    await closePair(pair)
  })

  test('PERF-001: a 10,000-message history opens fast and serves the newest page', async ({ request }) => {
    test.setTimeout(120_000)
    const seeded = await seedMessages(request, pair.conversation._id, 10_000)
    expect(seeded.inserted).toBe(10_000)

    const startedAt = Date.now()
    await openNamedConversation(pair.a.page, 'Perf History')
    await expect(pair.a.page.locator('[data-message-id]').first()).toBeVisible()
    const firstBubbleMs = Date.now() - startedAt

    const bubbles = await bubbleCount(pair.a.page)
    const domNodes = await domNodeCount(pair.a.page)
    await expect(pair.a.page.locator('[data-message-id]').last()).toContainText('perf message 09999')
    const summary = { seeded: seeded.inserted, firstBubbleMs, bubbles, domNodes }
    console.log(`[perf-001] ${JSON.stringify(summary)}`)

    expect(bubbles).toBe(30)
    expect(firstBubbleMs).toBeLessThan(5_000)
  })

  test('PERF-001b: scrolling to the top loads the next older page', async () => {
    // BUG-051: Chats never requests an older page, so this times out on the
    // request and no extra bubbles ever arrive.
    test.fail(true, 'BUG-051: scrolling to the top never loads the previous history page')
    test.setTimeout(60_000)
    await expect(pair.a.page.locator('[data-message-id]')).toHaveCount(30)
    const olderRequest = pair.a.page
      .waitForRequest(
        (candidate) => candidate.url().includes('/messages') && candidate.url().includes('before='),
        { timeout: 5_000 },
      )
      .catch(() => null)
    await pair.a.page.locator('main .overflow-auto').evaluate((node) => {
      node.scrollTop = 0
      node.dispatchEvent(new Event('scroll'))
    })
    expect(await olderRequest).not.toBeNull()
    await expect(pair.a.page.locator('[data-message-id]')).not.toHaveCount(30)
  })

  test('PERF-004: 200 open/close cycles release memory and object URLs', async () => {
    test.setTimeout(300_000)
    await openNamedConversation(pair.a.page, 'Perf History')
    await expect(pair.a.page.locator('[data-message-id]')).toHaveCount(30)

    await pastePng(pair.a.page)
    const removeChip = pair.a.page.getByRole('button', { name: /(Remove|Cancel upload for) pasted\.png/ })
    await expect(removeChip).toBeVisible()
    const withPreview = await objectUrlStats(pair.a.page)
    expect(withPreview.live).toBe(1)
    await removeChip.click()
    await expect.poll(async () => (await objectUrlStats(pair.a.page)).live).toBe(0)

    const session = await createHeapSession(pair.a.page)
    const before = await heapUsedBytes(session)

    const cycles = 200
    const startedAt = Date.now()
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      const name = cycle % 2 === 0 ? 'Perf Other' : 'Perf History'
      await openNamedConversation(pair.a.page, name)
      if (name === 'Perf History') {
        await expect(pair.a.page.locator('[data-message-id]').first()).toBeVisible()
      }
    }
    const durationMs = Date.now() - startedAt
    const after = await heapUsedBytes(session)
    const urls = await objectUrlStats(pair.a.page)
    const summary = {
      cycles,
      durationMs,
      heapBeforeMb: mb(before),
      heapAfterMb: mb(after),
      heapGrowthMb: mb(after - before),
      urls,
    }
    console.log(`[perf-004] ${JSON.stringify(summary)}`)

    expect(after - before).toBeLessThan(8 * 1024 * 1024)
    expect(urls.live).toBe(0)
    expect(urls.revoked).toBe(urls.created)
  })

  test('PERF-004b: navigation does not duplicate live messages (StrictMode listeners)', async () => {
    test.setTimeout(120_000)
    await openNamedConversation(pair.a.page, 'Perf History')
    const text = `single delivery ${Date.now()}`
    await seedMessagesThroughSocket(pair.b.page, pair.conversation._id, [text])
    await expect(pair.a.page.getByText(text, { exact: true })).toHaveCount(1)

    for (let cycle = 0; cycle < 3; cycle += 1) {
      await openNamedConversation(pair.a.page, 'Perf Other')
      await openNamedConversation(pair.a.page, 'Perf History')
      await expect(pair.a.page.getByText(text, { exact: true })).toHaveCount(1)
    }
  })

  test('PERF-005: the Reconnecting banner appears offline and clears online', async () => {
    test.setTimeout(120_000)
    await openNamedConversation(pair.a.page, 'Perf History')
    await waitForSocket(pair.a.page)
    const offline = await setOffline(pair.a.context, true)
    try {
      await dropTransport(pair.a.page)
      await waitForBanner(pair.a.page, true, 30_000)
      expect(await bannerShown(pair.a.page)).toBe(true)

      await offline.set(false)
      await waitForBanner(pair.a.page, false, 40_000)
      await waitForSocket(pair.a.page)
      expect(await bannerShown(pair.a.page)).toBe(false)
    } finally {
      await offline.set(false).catch(() => {})
      await offline.detach()
    }
  })

  test('PERF-005b: messages missed while offline appear after reconnect', async () => {
    // BUG-091: Chats only fetches history when the active conversation changes,
    // so a reconnect rejoins the room but never fetches what it missed.
    test.fail(true, 'BUG-091: messages sent while a client is offline never appear after reconnect')
    test.setTimeout(120_000)
    const missed = [`missed-1-${Date.now()}`, `missed-2-${Date.now()}`, `missed-3-${Date.now()}`]
    await openNamedConversation(pair.a.page, 'Perf History')
    const offline = await setOffline(pair.a.context, true)
    try {
      await dropTransport(pair.a.page)
      await waitForBanner(pair.a.page, true, 30_000)
      await seedMessagesThroughSocket(pair.b.page, pair.conversation._id, missed)

      await offline.set(false)
      await waitForBanner(pair.a.page, false, 40_000)
      await waitForSocket(pair.a.page)

      const live = `live-after-reconnect-${Date.now()}`
      await seedMessagesThroughSocket(pair.b.page, pair.conversation._id, [live])
      await expect(pair.a.page.getByText(live, { exact: true })).toHaveCount(1, { timeout: 20_000 })
      await expect(pair.a.page.getByText(missed[0], { exact: true })).toHaveCount(1, { timeout: 15_000 })
    } finally {
      await offline.set(false).catch(() => {})
      await offline.detach()
    }
  })

  test('PERF-005c: a flapping connection does not duplicate messages', async () => {
    test.setTimeout(180_000)
    await openNamedConversation(pair.a.page, 'Perf History')
    const text = `flap-survivor-${Date.now()}`
    await seedMessagesThroughSocket(pair.b.page, pair.conversation._id, [text])
    await expect(pair.a.page.getByText(text, { exact: true })).toHaveCount(1)

    const offline = await setOffline(pair.a.context, true)
    try {
      for (let flap = 0; flap < 4; flap += 1) {
        await offline.set(true)
        await dropTransport(pair.a.page)
        await waitForBanner(pair.a.page, true, 30_000)
        await offline.set(false)
        await waitForBanner(pair.a.page, false, 40_000)
        await waitForSocket(pair.a.page)
      }
    } finally {
      await offline.set(false).catch(() => {})
      await offline.detach()
    }

    const ids = await messageIds(pair.a.page)
    expect(new Set(ids).size).toBe(ids.length)
    await expect(pair.a.page.getByText(text, { exact: true })).toHaveCount(1)
  })

  test('PERF-005d: slow 3G still delivers a message', async () => {
    test.setTimeout(120_000)
    await openNamedConversation(pair.a.page, 'Perf History')
    const throttle = await throttleSlow3G(pair.a.context)
    try {
      const text = `slow-3g-${Date.now()}`
      await seedMessagesThroughSocket(pair.b.page, pair.conversation._id, [text])
      await expect(pair.a.page.getByText(text, { exact: true })).toHaveCount(1, { timeout: 45_000 })
    } finally {
      await throttle.reset().catch(() => {})
      await throttle.detach()
    }
  })

  test('PERF-006: clients reconnect, rejoin rooms, and keep sending after a server restart', async ({ request }) => {
    test.setTimeout(180_000)
    await openNamedConversation(pair.a.page, 'Perf History')
    // B must have the conversation open too: Chats only appends a live message
    // to the list of the conversation that is currently active.
    await openNamedConversation(pair.b.page, 'Perf History')
    const before = `before-restart-${Date.now()}`
    await seedMessagesThroughSocket(pair.a.page, pair.conversation._id, [before])
    await expect(pair.b.page.getByText(before, { exact: true })).toHaveCount(1, { timeout: 20_000 })

    const restarted = await restartMainServer(request)
    console.log(`[perf-006] restart ${JSON.stringify(restarted)}`)
    expect(restarted.restarted).toBe(true)

    await expect
      .poll(() => pair.a.page.evaluate(() => window.__socket?.connected === true), { timeout: 45_000 })
      .toBe(true)
    await expect
      .poll(() => pair.b.page.evaluate(() => window.__socket?.connected === true), { timeout: 45_000 })
      .toBe(true)
    await expect(pair.a.page.getByText('Reconnecting…')).toBeHidden({ timeout: 30_000 })

    const after = `after-restart-${Date.now()}`
    await seedMessagesThroughSocket(pair.a.page, pair.conversation._id, [after])
    await expect(pair.a.page.getByText(after, { exact: true })).toHaveCount(1, { timeout: 20_000 })
    await expect(pair.b.page.getByText(after, { exact: true })).toHaveCount(1, { timeout: 20_000 })
    await expect(pair.b.page.getByText(before, { exact: true })).toHaveCount(1)
  })
})
