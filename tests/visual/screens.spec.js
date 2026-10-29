import { expect, test } from '@playwright/test'
import { APP_URL, loginViaUi } from '../helpers/users.js'
import { registerUser } from '../helpers/flows.js'
import { navigateInApp } from '../helpers/flows.js'
import {
  VIEWPORTS,
  openSeededChat,
  primeTheme,
  waitForStableUi,
} from '../helpers/appearance.js'

function chatMasks(page) {
  return [page.locator('time'), page.locator('[role="separator"]')]
}

test.describe('Visual baselines: key screens (5.15, 6.3)', () => {
  for (const mode of ['light', 'dark']) {
    test(`login baselines in ${mode}`, async ({ browser }) => {
      const context = await browser.newContext({ baseURL: APP_URL, colorScheme: mode })
      await primeTheme(context, mode)
      const page = await context.newPage()
      try {
        for (const viewport of VIEWPORTS) {
          await page.setViewportSize({ width: viewport.width, height: viewport.height })
          await page.goto('/login')
          await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
          await expect(page.locator('html')).toHaveAttribute('data-theme', mode)
          await waitForStableUi(page)
          await page.mouse.move(0, 0)
          await expect(page).toHaveScreenshot(`login-${mode}-${viewport.name}.png`, {
            fullPage: true,
          })
        }
      } finally {
        await context.close()
      }
    })

    test(`chat baselines in ${mode}`, async ({ browser, request }) => {
      const chat = await openSeededChat(browser, request, {
        colorScheme: mode,
        preference: mode,
      })
      try {
        for (const viewport of VIEWPORTS) {
          await chat.page.setViewportSize({ width: viewport.width, height: viewport.height })
          await waitForStableUi(chat.page)
          await chat.page.mouse.move(0, 0)
          await expect(chat.page).toHaveScreenshot(`chat-${mode}-${viewport.name}.png`, {
            mask: chatMasks(chat.page),
          })
        }
      } finally {
        await chat.context.close()
      }
    })

    test(`profile baselines in ${mode}`, async ({ browser, request }) => {
      const user = await registerUser(request, 'vis', 'Alice Visual')
      const context = await browser.newContext({ baseURL: APP_URL, colorScheme: mode })
      await primeTheme(context, mode)
      const page = await context.newPage()
      try {
        await loginViaUi(page, { identifier: user.user.username, password: user.user.password })
        await navigateInApp(page, '/profile')
        await expect(page.getByPlaceholder('Display name')).toBeVisible()
        for (const viewport of VIEWPORTS) {
          await page.setViewportSize({ width: viewport.width, height: viewport.height })
          await waitForStableUi(page)
          await page.mouse.move(0, 0)
          await expect(page).toHaveScreenshot(`profile-${mode}-${viewport.name}.png`, {
            mask: [page.locator('input').nth(1)],
          })
        }
      } finally {
        await context.close()
      }
    })
  }
})
