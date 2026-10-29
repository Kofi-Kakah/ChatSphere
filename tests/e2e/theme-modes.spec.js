import { expect, test } from '@playwright/test'
import { APP_URL } from '../helpers/users.js'
import {
  openSeededChat,
  primeTheme,
  readThemeState,
  setThemeThroughStore,
} from '../helpers/appearance.js'

test.describe('E2E light, dark, and system modes (5.15)', () => {
  test('a persisted dark choice is applied before the app bundle runs', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: APP_URL, colorScheme: 'light' })
    await primeTheme(context, 'dark')
    await context.addInitScript(() => {
      window.__themeTrace = []
      const record = () => {
        try {
          window.__themeTrace.push(document.documentElement.getAttribute('data-theme'))
        } catch {
          /* documentElement not ready */
        }
      }
      try {
        new MutationObserver(record).observe(document, {
          attributes: true,
          subtree: true,
          attributeFilter: ['data-theme'],
        })
        document.addEventListener('readystatechange', record)
        document.addEventListener('DOMContentLoaded', record)
      } catch {
        /* the assertions below fail if the trace is empty */
      }
    })
    const page = await context.newPage()
    await page.route('**/src/main.jsx*', (route) => route.abort())
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded' })
    } catch {
      /* an aborted module request can surface as a navigation error */
    }

    const state = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      trace: window.__themeTrace,
      appHtml: document.getElementById('root')?.innerHTML ?? null,
    }))

    expect(state.appHtml, 'React never mounted, so this is the pre-hydration paint').toBe('')
    expect(state.theme).toBe('dark')
    expect(state.trace.length).toBeGreaterThan(0)
    expect(state.trace[0]).toBe('dark')
    expect(state.trace.every((value) => value === 'dark')).toBe(true)
    await context.close()
  })

  test('System follows the OS live without a reload and color-scheme matches', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: APP_URL, colorScheme: 'light' })
    const page = await context.newPage()
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()

    let state = await readThemeState(page)
    expect(state.theme).toBe('light')
    expect(state.colorScheme).toBe('light')

    await page.evaluate(() => {
      window.__noReloadMarker = 'still-here'
    })
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    state = await readThemeState(page)
    expect(state.colorScheme).toBe('dark')
    expect(await page.evaluate(() => window.__noReloadMarker)).toBe('still-here')

    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await context.close()
  })

  test('explicit light and dark choices override the OS and use the token palette', async ({ browser }) => {
    const expectations = {
      light: { background: 'rgb(245, 246, 250)', text: 'rgb(16, 24, 40)' },
      dark: { background: 'rgb(11, 15, 25)', text: 'rgb(242, 244, 247)' },
    }
    for (const preference of ['light', 'dark']) {
      const osScheme = preference === 'dark' ? 'light' : 'dark'
      const context = await browser.newContext({ baseURL: APP_URL, colorScheme: osScheme })
      await primeTheme(context, preference)
      const page = await context.newPage()
      await page.goto('/login')
      await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()

      const state = await readThemeState(page)
      expect(state.theme, `${preference} wins over an ${osScheme} OS`).toBe(preference)
      expect(state.colorScheme).toBe(preference)
      expect(state.bodyBackground).toBe(expectations[preference].background)
      expect(state.bodyColor).toBe(expectations[preference].text)
      await context.close()
    }
  })

  test('the chosen mode persists across a reload', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: APP_URL, colorScheme: 'light' })
    const page = await context.newPage()
    await page.goto('/login')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await setThemeThroughStore(page, 'dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const stored = await page.evaluate(() => localStorage.getItem('chatsphere-theme'))
    expect(JSON.parse(stored).state.preference).toBe('dark')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const afterReload = await readThemeState(page)
    expect(afterReload.theme).toBe('dark')
    await context.close()
  })

  test('a mode change in one tab syncs to another tab', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: APP_URL, colorScheme: 'light' })
    const first = await context.newPage()
    const second = await context.newPage()
    await first.goto('/login')
    await second.goto('/login')
    await expect(second.locator('html')).toHaveAttribute('data-theme', 'light')

    await setThemeThroughStore(first, 'dark')
    await expect(second.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 5000 })
    expect(await second.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark')
    await context.close()
  })

  test('the emoji picker follows the app mode, not the OS', async ({ browser, request }) => {
    test.fail(true, 'BUG-064: the emoji picker is passed theme="auto", which follows the OS instead of the app light/dark mode')
    const chat = await openSeededChat(browser, request, { colorScheme: 'light', preference: 'dark' })
    try {
      await chat.page.getByRole('button', { name: '🙂' }).click()
      await expect(chat.page.getByRole('textbox', { name: /search for an emoji/i })).toBeVisible({
        timeout: 15_000,
      })
      const picker = chat.page.locator('.EmojiPickerReact')
      await expect(picker).toBeVisible()
      const isDark = await picker.evaluate((element) => element.classList.contains('epr-dark-theme'))
      expect(isDark, 'app dark mode must force the dark picker even when the OS is light').toBe(true)
    } finally {
      await chat.context.close()
    }
  })

  test('prefers-reduced-motion disables non-essential animation', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: APP_URL, reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()

    const durations = await page.evaluate(() => {
      const button = getComputedStyle(document.querySelector('button'))
      const form = getComputedStyle(document.querySelector('form'))
      return {
        transition: button.transitionDuration,
        animation: form.animationDuration,
      }
    })
    expect(parseFloat(durations.transition)).toBeLessThan(0.05)
    expect(parseFloat(durations.animation)).toBeLessThan(0.05)
    await context.close()
  })
})
