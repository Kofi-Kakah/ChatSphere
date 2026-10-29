import { expect } from '@playwright/test'
import { API_URL, APP_URL, loginViaUi, registerViaApi, uniqueUser } from './users.js'

export function namedUser(prefix, displayName) {
  return { ...uniqueUser(prefix), displayName }
}

export async function registerUser(request, prefix, displayName) {
  const credentials = namedUser(prefix, displayName)
  const registration = await registerViaApi(request, credentials)
  return {
    user: { ...credentials, _id: registration.user._id },
    registration,
    accessToken: registration.accessToken,
  }
}

export async function createUserContext(browser, user, options = {}) {
  const context = await browser.newContext({ baseURL: APP_URL, ...options })
  return { context }
}

export async function openAnonymousContext(browser, options = {}) {
  const context = await browser.newContext({ baseURL: APP_URL, ...options })
  const page = await context.newPage()
  return { context, page }
}

export function authHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}` }
}

export async function createDirectViaApi(request, actor, otherId) {
  const response = await request.post(`${API_URL}/conversations/direct`, {
    headers: authHeaders(actor.accessToken),
    data: { userId: otherId },
  })
  expect(response.ok()).toBeTruthy()
  return (await response.json()).conversation
}

export async function createGroupViaApi(request, actor, memberIds, name) {
  const response = await request.post(`${API_URL}/conversations/group`, {
    headers: authHeaders(actor.accessToken),
    data: { name, memberIds },
  })
  expect(response.ok()).toBeTruthy()
  return (await response.json()).conversation
}

export async function openUserContext(browser, user, options = {}) {
  const { context } = await createUserContext(browser, user, options)
  const page = await context.newPage()
  await loginViaUi(page, { identifier: user.username, password: user.password })
  return { context, page }
}

export async function accessTokenFromPage(page) {
  await expect.poll(() => page.evaluate(() => window.__socket?.auth?.token ?? null)).toBeTruthy()
  return page.evaluate(() => window.__socket.auth.token)
}

export async function waitForSocket(page) {
  await expect.poll(() => page.evaluate(() => window.__socket?.connected === true)).toBe(true)
}

export async function fetchMe(request, accessToken) {
  const response = await request.get(`${API_URL}/auth/me`, { headers: authHeaders(accessToken) })
  expect(response.ok()).toBeTruthy()
  return (await response.json()).user
}

export async function navigateInApp(page, path) {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

export async function seedMessagesThroughSocket(page, conversationId, texts) {
  await waitForSocket(page)
  return page.evaluate(
    async ({ conversationId: convId, texts: bodies }) => {
      const socket = window.__socket
      const acks = []
      for (const text of bodies) {
        const ack = await new Promise((resolve) => {
          socket.emit(
            'message:send',
            { conversationId: convId, clientId: crypto.randomUUID(), type: 'text', text },
            resolve,
          )
        })
        acks.push(ack)
      }
      return acks
    },
    { conversationId, texts },
  )
}

export async function createDirectPair(browser, request, options = {}) {
  const {
    prefixA = 'aa',
    nameA = 'Alice A',
    prefixB = 'bb',
    nameB = 'Bob B',
    contextOptionsA = {},
    contextOptionsB = {},
  } = options
  const alice = await registerUser(request, prefixA, nameA)
  const bob = await registerUser(request, prefixB, nameB)
  const conversation = await createDirectViaApi(request, alice, bob.user._id)
  const a = await openUserContext(browser, alice.user, contextOptionsA)
  const b = await openUserContext(browser, bob.user, contextOptionsB)
  return { alice, bob, conversation, a, b }
}

export async function closePair(pair) {
  if (!pair) return
  await pair.a?.context.close()
  await pair.b?.context.close()
}

export async function openFirstConversation(page) {
  const row = page.locator('aside .cursor-pointer').first()
  await expect(row).toBeVisible()
  await row.click()
  await expect(page.locator('main header')).not.toHaveText(/Select a chat/)
}

export async function openConversationNamed(page, name) {
  const row = page.locator('aside').getByText(name, { exact: true })
  await expect(row).toBeVisible()
  await row.click()
  await expect(page.locator('main header')).toContainText(name)
}

export function normalizeSpace(value) {
  return String(value).replace(/\s+/g, ' ').trim()
}

export async function startChatThroughUi(page, username) {
  page.once('dialog', (dialog) => dialog.accept(username))
  await page.getByRole('button', { name: 'New' }).click()
  await expect(page.locator('main header')).not.toHaveText(/Select a chat/)
}

export async function sendMessageThroughUi(page, text) {
  const composer = page.getByPlaceholder('Type a message')
  await composer.fill(text)
  await composer.press('Enter')
}

export function messageBubbles(page, text) {
  return page.locator('[data-message-id]').filter({ hasText: text })
}

export function messageRow(page, text) {
  return messageBubbles(page, text).first()
}

export async function expectMessageVisible(page, text) {
  await expect(messageRow(page, text)).toBeVisible({ timeout: 15_000 })
}

export async function fixBrowserDate(page, date) {
  await page.clock.setFixedTime(date)
}

export function trackEmojiPickerRequests(page) {
  const requests = []
  page.on('request', (request) => {
    if (/emoji-picker/i.test(request.url())) requests.push(request.url())
  })
  return requests
}

export async function openEmojiPicker(page) {
  await page.getByRole('button', { name: '🙂' }).click()
  return page.getByRole('textbox', { name: 'Type to search for an emoji' })
}
