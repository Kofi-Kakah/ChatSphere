import { expect, test } from '@playwright/test'
import { APP_URL, loginViaUi } from '../helpers/users.js'
import {
  createDirectViaApi,
  openFirstConversation,
  openUserContext,
  registerUser,
  seedMessagesThroughSocket,
  sendMessageThroughUi,
  waitForSocket,
} from '../helpers/flows.js'

async function installNotificationStub(context, { permission = 'granted', desktopEnabled = true } = {}) {
  await context.addInitScript(
    ({ permission: permissionValue, desktopEnabled: enabled }) => {
      window.__notifications = []
      window.__permissionRequests = []
      class StubNotification {
        constructor(title, options) {
          this.title = title
          this.body = options?.body
          this.onclick = null
          this.close = () => {}
          window.__notifications.push(this)
        }
        static permission = permissionValue
        static requestPermission() {
          window.__permissionRequests.push({
            gesture: Boolean(navigator.userActivation?.isActive),
            at: Date.now(),
          })
          return Promise.resolve(permissionValue)
        }
      }
      window.Notification = StubNotification
      try {
        localStorage.setItem(
          'chatsphere-notifications',
          JSON.stringify({ state: { desktopEnabled: enabled }, version: 0 }),
        )
      } catch {
        /* opaque origin */
      }
    },
    { permission, desktopEnabled },
  )
}

async function setHidden(page, hidden) {
  await page.evaluate((value) => {
    window.__forceHidden = value
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__forceHidden })
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (window.__forceHidden ? 'hidden' : 'visible'),
    })
  }, hidden)
}

async function setupPair(browser, request, { stub = null, notificationOptions = {} } = {}) {
  const alice = await registerUser(request, 'nta', 'Alice Notify')
  const bob = await registerUser(request, 'ntb', 'Bob Notify')
  const conversation = await createDirectViaApi(request, alice, bob.user._id)

  const aliceContext = await browser.newContext({ baseURL: APP_URL })
  if (stub) await stub(aliceContext, notificationOptions)
  const alicePage = await aliceContext.newPage()
  await loginViaUi(alicePage, { identifier: alice.user.username, password: alice.user.password })
  await waitForSocket(alicePage)

  const bobClient = await openUserContext(browser, bob.user)
  await waitForSocket(bobClient.page)

  return {
    alice,
    bob,
    conversation,
    alicePage,
    aliceContext,
    bobPage: bobClient.page,
    bobContext: bobClient.context,
  }
}

async function closePair(pair) {
  await pair.aliceContext?.close()
  await pair.bobContext?.close()
}

test.describe('Notifications (5.13)', () => {
  test('a message in the open conversation shows no toast and no unread count', async ({ browser, request }) => {
    const pair = await setupPair(browser, request)
    try {
      await openFirstConversation(pair.alicePage)
      await expect(pair.alicePage.getByPlaceholder('Type a message')).toBeVisible()

      await seedMessagesThroughSocket(pair.bobPage, pair.conversation._id, ['live ping'])

      await expect(pair.alicePage.locator('[data-message-id]').filter({ hasText: 'live ping' })).toBeVisible({
        timeout: 15_000,
      })
      expect(await pair.alicePage.title()).toBe('ChatSphere')
      await expect(pair.alicePage.getByRole('status')).toHaveCount(0)
    } finally {
      await closePair(pair)
    }
  })

  test('a message in a closed conversation shows a toast, unread title, and clears on open', async ({ browser, request }) => {
    const pair = await setupPair(browser, request)
    try {
      expect(await pair.alicePage.title()).toBe('ChatSphere')

      await seedMessagesThroughSocket(pair.bobPage, pair.conversation._id, ['closed ping'])

      await expect(pair.alicePage.getByRole('status')).toHaveText('New message', { timeout: 15_000 })
      await expect.poll(() => pair.alicePage.title()).toBe('(1) ChatSphere')

      await openFirstConversation(pair.alicePage)
      await expect(pair.alicePage.getByPlaceholder('Type a message')).toBeVisible()
      await expect.poll(() => pair.alicePage.title()).toBe('ChatSphere')
    } finally {
      await closePair(pair)
    }
  })

  test('a desktop notification is shown only while the tab is hidden', async ({ browser, request }) => {
    const pair = await setupPair(browser, request, { stub: installNotificationStub })
    try {
      await setHidden(pair.alicePage, true)
      await seedMessagesThroughSocket(pair.bobPage, pair.conversation._id, ['desktop ping'])

      await expect
        .poll(() => pair.alicePage.evaluate(() => window.__notifications.length), { timeout: 15_000 })
        .toBe(1)
      const shown = await pair.alicePage.evaluate(() => ({
        title: window.__notifications[0].title,
        body: window.__notifications[0].body,
      }))
      expect(shown.title).toBe('New message')
      expect(shown.body).toContain('desktop ping')

      await setHidden(pair.alicePage, false)
      await seedMessagesThroughSocket(pair.bobPage, pair.conversation._id, ['visible ping'])
      await expect.poll(() => pair.alicePage.title()).toBe('(2) ChatSphere', { timeout: 15_000 })

      expect(await pair.alicePage.evaluate(() => window.__notifications.length)).toBe(1)
    } finally {
      await closePair(pair)
    }
  })

  test('clicking a desktop notification focuses the app and opens the conversation', async ({ browser, request }) => {
    test.fail(true, 'BUG-080: desktop notifications carry no click handler, so clicking one does not open the chat')
    const pair = await setupPair(browser, request, { stub: installNotificationStub })
    try {
      await setHidden(pair.alicePage, true)
      await seedMessagesThroughSocket(pair.bobPage, pair.conversation._id, ['click me'])
      await expect
        .poll(() => pair.alicePage.evaluate(() => window.__notifications.length), { timeout: 15_000 })
        .toBe(1)

      const clickable = await pair.alicePage.evaluate(
        () => typeof window.__notifications[0].onclick === 'function',
      )
      expect(clickable).toBe(true)

      await setHidden(pair.alicePage, false)
      await pair.alicePage.evaluate(() => window.__notifications[0].onclick({ preventDefault() {} }))
      await expect(pair.alicePage.locator('main header')).toContainText('Bob Notify')
      await expect(pair.alicePage.getByPlaceholder('Type a message')).toBeVisible()
    } finally {
      await closePair(pair)
    }
  })

  test('permission is never requested on load and requires a user gesture', async ({ browser, request }) => {
    test.fail(true, 'BUG-040: there is no Settings screen, so no user gesture can enable notifications')
    const pair = await setupPair(browser, request, {
      stub: installNotificationStub,
      notificationOptions: { permission: 'default', desktopEnabled: false },
    })
    try {
      expect(await pair.alicePage.evaluate(() => window.__permissionRequests.length)).toBe(0)

      const enable = pair.alicePage.getByRole('button', { name: /enable notifications/i })
      await expect(enable).toBeVisible({ timeout: 5000 })
      await enable.click()
      await expect
        .poll(() => pair.alicePage.evaluate(() => window.__permissionRequests.length))
        .toBe(1)
      expect(
        await pair.alicePage.evaluate(() => window.__permissionRequests[0].gesture),
      ).toBe(true)
    } finally {
      await closePair(pair)
    }
  })

  test('own messages from another tab do not raise notifications here', async ({ browser, request }) => {
    test.fail(true, 'BUG-037: the server echoes the send to the sender, and the client never checks who sent it')
    const alice = await registerUser(request, 'nta', 'Alice Notify')
    const bob = await registerUser(request, 'ntb', 'Bob Notify')
    const conversation = await createDirectViaApi(request, alice, bob.user._id)
    const context = await browser.newContext({ baseURL: APP_URL })
    try {
      const first = await context.newPage()
      await loginViaUi(first, { identifier: alice.user.username, password: alice.user.password })
      await waitForSocket(first)

      const second = await context.newPage()
      await loginViaUi(second, { identifier: alice.user.username, password: alice.user.password })
      await waitForSocket(second)
      await openFirstConversation(second)
      await sendMessageThroughUi(second, 'sent from my other tab')
      await expect(second.locator('[data-message-id]').filter({ hasText: 'sent from my other tab' })).toBeVisible({
        timeout: 15_000,
      })

      await expect(first.getByRole('status')).toHaveCount(0, { timeout: 5000 })
      expect(await first.title()).toBe('ChatSphere')
      expect(
        await first.evaluate(() => {
          const raw = localStorage.getItem('chatsphere-notifications')
          const state = raw ? JSON.parse(raw).state : {}
          return state.unread?.[conversation._id] ?? null
        }),
      ).toBeNull()
    } finally {
      await context.close()
    }
  })

  test('100 messages in five seconds do not freeze the UI and keep a single toast', async ({ browser, request }) => {
    const pair = await setupPair(browser, request)
    try {
      const started = Date.now()
      await seedMessagesThroughSocket(
        pair.bobPage,
        pair.conversation._id,
        Array.from({ length: 100 }, (_, index) => `flood ${index + 1}`),
      )
      await expect.poll(() => pair.alicePage.title(), { timeout: 20_000 }).toBe('(100) ChatSphere')
      const elapsed = Date.now() - started

      const toastCount = await pair.alicePage.getByRole('status').count()
      expect(toastCount).toBeLessThanOrEqual(1)
      await openFirstConversation(pair.alicePage)
      await sendMessageThroughUi(pair.alicePage, 'still responsive')
      await expect(
        pair.alicePage.locator('[data-message-id]').filter({ hasText: 'still responsive' }).first(),
      ).toBeVisible({ timeout: 15_000 })
      expect(elapsed).toBeLessThan(15_000)
    } finally {
      await closePair(pair)
    }
  })

  test('a mute control exists for the open conversation', async ({ browser, request }) => {
    test.fail(true, 'BUG-078: no mute API or UI exists; the model field is never set or enforced')
    const pair = await setupPair(browser, request)
    try {
      await openFirstConversation(pair.alicePage)
      await expect(pair.alicePage.getByRole('button', { name: /mute/i })).toBeVisible({ timeout: 5000 })
    } finally {
      await closePair(pair)
    }
  })

  test('two tabs of the same user both raise their own notification (duplicate-tab observation)', async ({ browser, request }) => {
    const alice = await registerUser(request, 'nta', 'Alice Notify')
    const bob = await registerUser(request, 'ntb', 'Bob Notify')
    const conversation = await createDirectViaApi(request, alice, bob.user._id)

    const context = await browser.newContext({ baseURL: APP_URL })
    await installNotificationStub(context)
    try {
      const first = await context.newPage()
      await loginViaUi(first, { identifier: alice.user.username, password: alice.user.password })
      await waitForSocket(first)
      const second = await context.newPage()
      await loginViaUi(second, { identifier: alice.user.username, password: alice.user.password })
      await waitForSocket(second)
      await setHidden(first, true)
      await setHidden(second, true)

      const bobClient = await openUserContext(browser, bob.user)
      try {
        await seedMessagesThroughSocket(bobClient.page, conversation._id, ['one ping'])
        await expect.poll(() => first.evaluate(() => window.__notifications.length), { timeout: 15_000 }).toBe(1)
        await expect.poll(() => second.evaluate(() => window.__notifications.length), { timeout: 15_000 }).toBe(1)

        const counts = await Promise.all([
          first.evaluate(() => window.__notifications.length),
          second.evaluate(() => window.__notifications.length),
        ])
        test.info().annotations.push({
          type: 'duplicate-tabs',
          description: `tabA=${counts[0]} tabB=${counts[1]} — each tab raises its own desktop notification for one incoming message`,
        })
        console.log(`[duplicate-tabs] tabA=${counts[0]} tabB=${counts[1]}`)

        await expect.poll(() => first.title()).toBe('(1) ChatSphere')
        await expect.poll(() => second.title()).toBe('(1) ChatSphere')
      } finally {
        await bobClient.context.close()
      }
    } finally {
      await context.close()
    }
  })
})
