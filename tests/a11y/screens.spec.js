import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { APP_URL } from '../helpers/users.js'
import { loginViaUi, registerViaApi, uniqueUser } from '../helpers/users.js'
import { openSeededChat, CHAT_BACKGROUNDS } from '../helpers/appearance.js'
import { navigateInApp } from '../helpers/flows.js'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const BLOCKING_IMPACTS = new Set(['serious', 'critical'])

async function analyze(page, testInfo, label) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  await testInfo.attach(`axe-${label}`, {
    body: JSON.stringify(
      {
        violations: results.violations,
        incomplete: results.incomplete.map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.length })),
      },
      null,
      2,
    ),
    contentType: 'application/json',
  })
  return results.violations
}

function summarize(violations) {
  return violations
    .map((violation) => `${violation.id} (${violation.impact}): ${violation.nodes.length} node(s)`)
    .join('; ')
}

async function expectNoBlockingViolations(page, testInfo, label) {
  const violations = await analyze(page, testInfo, label)
  const blocking = violations.filter((violation) => BLOCKING_IMPACTS.has(violation.impact))
  expect(blocking, `${label} — ${summarize(blocking) || 'no violations'}`).toEqual([])
  return violations
}

async function openEmptyChats(browser, request, contextOptions = {}) {
  const user = uniqueUser('axee')
  await registerViaApi(request, user)
  const context = await browser.newContext({ baseURL: APP_URL, ...contextOptions })
  const page = await context.newPage()
  await loginViaUi(page, { identifier: user.username, password: user.password })
  await expect(page.getByRole('button', { name: 'New' })).toBeVisible()
  return { context, page }
}

test.describe('Axe: forms (6.2)', () => {
  for (const mode of ['light', 'dark']) {
    test(`login and register pass axe in ${mode}`, async ({ browser }, testInfo) => {
      const context = await browser.newContext({ baseURL: APP_URL, colorScheme: mode })
      const page = await context.newPage()
      try {
        await page.goto('/login')
        await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
        await expectNoBlockingViolations(page, testInfo, `login-${mode}`)

        await page.goto('/register')
        await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible()
        await expectNoBlockingViolations(page, testInfo, `register-${mode}`)
      } finally {
        await context.close()
      }
    })
  }
})

test.describe('Axe: design preview (6.2)', () => {
  for (const mode of ['light', 'dark']) {
    test(`design preview passes axe in ${mode}`, async ({ browser }, testInfo) => {
      test.fail(true, 'BUG-066: danger-button and dark avatar-initial token contrast is below WCAG AA')
      const context = await browser.newContext({ baseURL: APP_URL, colorScheme: mode })
      const page = await context.newPage()
      try {
        await page.goto('/design-preview')
        await expect(page.getByRole('heading', { name: 'Design Preview' })).toBeVisible()
        await expectNoBlockingViolations(page, testInfo, `design-preview-${mode}`)
      } finally {
        await context.close()
      }
    })
  }
})

test.describe('Axe: authenticated screens (6.2)', () => {
  for (const mode of ['light', 'dark']) {
    test(`the empty chat list passes axe in ${mode}`, async ({ browser, request }, testInfo) => {
      const { context, page } = await openEmptyChats(browser, request, { colorScheme: mode })
      try {
        await expectNoBlockingViolations(page, testInfo, `chats-empty-${mode}`)
      } finally {
        await context.close()
      }
    })
  }

  test('the profile screen passes axe in light', async ({ browser, request }, testInfo) => {
    const { context, page } = await openEmptyChats(browser, request, { colorScheme: 'light' })
    try {
      await navigateInApp(page, '/profile')
      await expect(page.getByPlaceholder('Display name')).toBeVisible()
      await expectNoBlockingViolations(page, testInfo, 'profile-light')
    } finally {
      await context.close()
    }
  })

  test('the profile screen passes axe in dark', async ({ browser, request }, testInfo) => {
    test.fail(true, 'BUG-066: avatar initials use primary on primary-soft at 3.02:1 in dark mode')
    const { context, page } = await openEmptyChats(browser, request, { colorScheme: 'dark' })
    try {
      await navigateInApp(page, '/profile')
      await expect(page.getByPlaceholder('Display name')).toBeVisible()
      await expectNoBlockingViolations(page, testInfo, 'profile-dark')
    } finally {
      await context.close()
    }
  })

  test('the open chat with its info panel passes axe in light', async ({ browser, request }, testInfo) => {
    test.fail(true, 'BUG-065: own-message timestamps are near-white on the light background (1.05:1)')
    const chat = await openSeededChat(browser, request, { colorScheme: 'light', preference: 'light' })
    try {
      await expect(chat.page.getByRole('heading', { name: 'Shared media' })).toBeVisible()
      await expectNoBlockingViolations(chat.page, testInfo, 'chat-light')
    } finally {
      await chat.context.close()
    }
  })

  test('the open chat with its info panel passes axe in dark', async ({ browser, request }, testInfo) => {
    test.fail(true, 'BUG-066: the selected media tab uses primary on primary-soft at 3.02:1 in dark mode')
    const chat = await openSeededChat(browser, request, { colorScheme: 'dark', preference: 'dark' })
    try {
      await expect(chat.page.getByRole('heading', { name: 'Shared media' })).toBeVisible()
      await expectNoBlockingViolations(chat.page, testInfo, 'chat-dark')
    } finally {
      await chat.context.close()
    }
  })
})

test.describe('Axe: chat backgrounds (6.2)', () => {
  for (const background of CHAT_BACKGROUNDS.filter((item) => item !== 'default')) {
    test(`the ${background} background renders and passes axe`, async ({ browser, request }, testInfo) => {
      test.fail(true, 'BUG-050: no chat background picker or data-chat-theme rendering exists')
      const chat = await openSeededChat(browser, request, { colorScheme: 'dark', preference: 'dark' })
      try {
        await expect(chat.page.locator(`[data-chat-theme="${background}"]`)).toBeVisible()
        await expectNoBlockingViolations(chat.page, testInfo, `chat-${background}-dark`)
      } finally {
        await chat.context.close()
      }
    })
  }
})
