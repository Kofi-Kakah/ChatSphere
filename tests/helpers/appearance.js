import { expect } from '@playwright/test'
import { APP_URL } from './users.js'
import { loginViaUi } from './users.js'
import {
  createDirectViaApi,
  openFirstConversation,
  registerUser,
  seedMessagesThroughSocket,
  waitForSocket,
} from './flows.js'

export const VIEWPORTS = [
  { name: 'phone-360x760', width: 360, height: 760 },
  { name: 'phone-390x844', width: 390, height: 844 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'laptop-1024x768', width: 1024, height: 768 },
  { name: 'desktop-1440x900', width: 1440, height: 900 },
]

export const CHAT_BACKGROUNDS = ['default', 'love', 'friendship', 'battle']

export async function primeTheme(context, preference) {
  await context.addInitScript((pref) => {
    try {
      localStorage.setItem(
        'chatsphere-theme',
        JSON.stringify({ state: { preference: pref }, version: 0 }),
      )
    } catch {
      /* about:blank and other opaque origins */
    }
  }, preference)
}

export async function setThemeThroughStore(page, preference) {
  await page.evaluate(async (pref) => {
    const module = await import('/src/store/theme.js')
    module.useThemeStore.getState().setPreference(pref)
  }, preference)
}

export async function openSeededChat(browser, request, options = {}) {
  const {
    colorScheme = 'light',
    preference = null,
    viewport = { width: 1280, height: 720 },
    prefixA = 'ava',
    prefixB = 'avb',
    nameA = 'Alice A',
    nameB = 'Bob B',
    messages = ['Hello from the appearance baseline', 'Second message for the layout'],
  } = options

  const alice = await registerUser(request, prefixA, nameA)
  const bob = await registerUser(request, prefixB, nameB)
  const conversation = await createDirectViaApi(request, alice, bob.user._id)

  const context = await browser.newContext({ baseURL: APP_URL, colorScheme, viewport })
  if (preference) await primeTheme(context, preference)
  const page = await context.newPage()
  await loginViaUi(page, { identifier: alice.user.username, password: alice.user.password })
  await waitForSocket(page)
  // Open the chat before seeding so the messages land in the active conversation.
  // Seeding first raises a 3 s "New message" toast that would otherwise be captured
  // in screenshots and overlap the composer on phones.
  await openFirstConversation(page)
  await expect(page.getByPlaceholder('Type a message')).toBeVisible()
  await seedMessagesThroughSocket(page, conversation._id, messages)
  await expect(page.locator('[data-message-id]').first()).toBeVisible()
  await page.mouse.move(0, 0)

  return { alice, bob, conversation, context, page }
}

export async function readThemeState(page) {
  return page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    bodyColor: getComputedStyle(document.body).color,
  }))
}

export async function layoutMetrics(page) {
  return page.evaluate(() => {
    const root = document.documentElement
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      theme: root.getAttribute('data-theme'),
      colorScheme: getComputedStyle(root).colorScheme,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
    }
  })
}

export async function collectSmallTargets(page, selector = 'main button, main a[href], main textarea, main input') {
  return page.locator(selector).evaluateAll((elements) =>
    elements
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        if (
          rect.width === 0 ||
          rect.height === 0 ||
          style.visibility === 'hidden' ||
          style.display === 'none'
        ) {
          return null
        }
        return {
          tag: element.tagName.toLowerCase(),
          label:
            (element.getAttribute('aria-label') || element.textContent || element.getAttribute('placeholder') || '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 48),
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        }
      })
      .filter(Boolean),
  )
}

export async function waitForStableUi(page) {
  await page.evaluate(async () => {
    await document.fonts?.ready
    await Promise.all(
      Array.from(document.images)
        .filter((image) => !image.complete)
        .map((image) => new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true })
          image.addEventListener('error', resolve, { once: true })
        })),
    )
  })
}

export async function activeElementInfo(page) {
  return page.evaluate(() => {
    const element = document.activeElement
    if (!element) return null
    const style = getComputedStyle(element)
    return {
      tag: element.tagName.toLowerCase(),
      label: (element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 64),
      placeholder: element.getAttribute('placeholder') || '',
      focusVisible: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
    }
  })
}

export async function tabTo(page, matcher, maxTabs = 40) {
  for (let attempt = 0; attempt < maxTabs; attempt += 1) {
    await page.keyboard.press('Tab')
    const info = await activeElementInfo(page)
    if (info && matcher(info)) return info
  }
  return null
}
