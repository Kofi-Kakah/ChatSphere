import { test, expect } from '@playwright/test'
import { closePair, createDirectPair, openFirstConversation } from '../helpers/flows.js'
import { bubbleCount, domNodeCount } from '../helpers/performance.js'

// Testing.md 6.4: a 10,000-message conversation must keep the DOM small. The
// history is injected through a route so the harness database is not bloated by
// a second 10k seed; the renderer, the list component, and the browser are real.

test.describe.configure({ mode: 'serial' })

test.describe('long history virtualization (6.4)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Performance measurements use Chromium CDP')

  test('PERF-001c: 10,000 messages do not all enter the DOM', async ({ browser, request }) => {
    // BUG-076: MessageList maps every message; the DOM grows with the history.
    test.fail(true, 'BUG-076: the message list is not virtualized, so 10,000 messages create 10,000 bubbles')
    test.setTimeout(240_000)

    const pair = await createDirectPair(browser, request, { prefixA: 'vira', prefixB: 'virb' })
    try {
      const base = new Date('2026-01-01T00:00:00.000Z').getTime()
      const messages = Array.from({ length: 10_000 }, (_, index) => ({
        _id: (index + 1).toString(16).padStart(24, '0'),
        conversation: pair.conversation._id,
        sender: index % 2 === 0 ? pair.bob.user._id : pair.alice.user._id,
        type: 'text',
        text: `virtual message ${String(index).padStart(5, '0')}`,
        attachments: [],
        createdAt: new Date(base + index * 60_000).toISOString(),
        updatedAt: new Date(base + index * 60_000).toISOString(),
      }))
      await pair.a.page.route('**/api/conversations/*/messages*', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ messages }),
        }),
      )

      const startedAt = Date.now()
      await openFirstConversation(pair.a.page)
      await expect(pair.a.page.locator('[data-message-id]').first()).toBeVisible({ timeout: 60_000 })
      await expect(pair.a.page.locator('[data-message-id]').last()).toContainText('virtual message 09999')
      const renderMs = Date.now() - startedAt

      const bubbles = await bubbleCount(pair.a.page)
      const domNodes = await domNodeCount(pair.a.page)
      const geometry = await pair.a.page.evaluate(() => {
        const container = document.querySelector('main .overflow-auto')
        const started = performance.now()
        container.scrollTop = 0
        container.dispatchEvent(new Event('scroll'))
        container.getBoundingClientRect()
        return { scrollHeight: container.scrollHeight, clientHeight: container.clientHeight, scrollMs: performance.now() - started }
      })
      const summary = { messages: messages.length, renderMs, bubbles, domNodes, ...geometry }
      console.log(`[perf-001c] ${JSON.stringify(summary)}`)

      expect(renderMs).toBeLessThan(60_000)
      expect(bubbles).toBeLessThan(300)
      expect(domNodes).toBeLessThan(3_000)
    } finally {
      await closePair(pair)
    }
  })
})
