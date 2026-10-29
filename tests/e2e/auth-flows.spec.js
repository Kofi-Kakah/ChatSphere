import { expect, test } from '@playwright/test'
import {
  accessTokenFromPage,
  createUserContext,
  fetchMe,
  openAnonymousContext,
  openUserContext,
  registerUser,
} from '../helpers/flows.js'
import { API_URL, loginViaUi, uniqueUser } from '../helpers/users.js'

test.describe('E2E auth flows (5.1)', () => {
  test('registers through the UI and lands in the app', async ({ browser, request }) => {
    const user = uniqueUser('ui')
    const { context, page } = await openAnonymousContext(browser)
    try {
      await page.goto('/register')
      await page.getByPlaceholder('Username').fill(user.username)
      await page.getByPlaceholder('Email').fill(user.email)
      await page.getByPlaceholder('Display name').fill(user.displayName)
      await page.getByPlaceholder('Password').fill(user.password)
      await page.getByRole('button', { name: 'Create account' }).click()

      await expect(page).toHaveURL(/\/$/)
      await expect(page.getByText('Select a chat')).toBeVisible()

      const token = await accessTokenFromPage(page)
      const me = await fetchMe(request, token)
      expect(me.username).toBe(user.username)
      expect(me.displayName).toBe(user.displayName)
      expect(JSON.stringify(me)).not.toMatch(/passwordHash/i)

      const login = await request.post(`${API_URL}/auth/login`, {
        data: { identifier: user.email, password: user.password },
      })
      expect(login.ok()).toBeTruthy()
      const loginBody = await login.json()
      expect(JSON.stringify(loginBody)).not.toMatch(/passwordHash/i)
    } finally {
      await context.close()
    }
  })

  test('logs in by username and by email, case-insensitively', async ({ browser, request }) => {
    const account = await registerUser(request, 'login', 'E2E Login')
    for (const identifier of [account.user.username.toUpperCase(), account.user.email.toUpperCase()]) {
      const { context } = await createUserContext(browser, account.user)
      try {
        const page = await context.newPage()
        await loginViaUi(page, { identifier, password: account.user.password })
        await expect(page.getByText('Select a chat')).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Login' })).toHaveCount(0)
      } finally {
        await context.close()
      }
    }
  })

  test('shows the same generic error for a wrong password and an unknown account', async ({ browser, request }) => {
    const account = await registerUser(request, 'wrong', 'E2E Wrong')
    const unknown = uniqueUser('ghost')
    const { context, page } = await openAnonymousContext(browser)
    try {
      for (const identifier of [account.user.username, unknown.email]) {
        await page.goto('/login')
        await page.getByPlaceholder('Email or username').fill(identifier)
        await page.getByPlaceholder('Password').fill('Wrong!Pass123')
        await page.getByRole('button', { name: 'Sign in' }).click()

        await expect(page.getByText('Invalid credentials')).toBeVisible()
        await expect(page).toHaveURL(/\/login$/)
      }
    } finally {
      await context.close()
    }
  })

  test('keeps the access token out of Web Storage and the refresh cookie HttpOnly', async ({ browser, request }) => {
    const account = await registerUser(request, 'storage', 'E2E Storage')
    const { context, page } = await openUserContext(browser, account.user)
    try {
      const token = await accessTokenFromPage(page)
      const storage = await page.evaluate(() => ({
        local: JSON.stringify(localStorage),
        session: JSON.stringify(sessionStorage),
      }))
      expect(storage.local).not.toContain(token)
      expect(storage.session).not.toContain(token)

      const cookies = await context.cookies()
      const refresh = cookies.find((cookie) => cookie.name === 'refreshToken')
      expect(refresh, 'refreshToken cookie').toBeTruthy()
      expect(refresh.httpOnly).toBe(true)
      if (test.info().project.name === 'webkit') {
        // Playwright WebKit reports sameSite "None" for every cookie, even ones added as Lax,
        // so verify the attribute on a real refresh response instead.
        const refreshed = await context.request.post(`${API_URL}/auth/refresh`)
        expect(refreshed.ok()).toBe(true)
        const setCookie = (await refreshed.headersArray())
          .filter((header) => header.name.toLowerCase() === 'set-cookie')
          .map((header) => header.value)
          .join('\n')
        expect(setCookie).toMatch(/SameSite=Lax/i)
      } else {
        expect(refresh.sameSite).toBe('Lax')
      }
    } finally {
      await context.close()
    }
  })

  test('restores the signed-in session after a full page reload [BUG-039]', async ({ browser, request }) => {
    test.fail(true, 'BUG-039: a reload redirects to /login because the access token is memory-only and nothing bootstraps a refresh')
    const account = await registerUser(request, 'reload', 'E2E Reload')
    const { context, page } = await openUserContext(browser, account.user)
    try {
      await page.reload()

      await expect(page).toHaveURL(/\/$/, { timeout: 3000 })
      await expect(page.getByText('Select a chat')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Login' })).toHaveCount(0)
    } finally {
      await context.close()
    }
  })

  test('exposes navigation, profile access, a theme control, and logout [BUG-040]', async ({ browser, request }) => {
    test.fail(true, 'BUG-040: the app has no navigation rail, no Settings screen, and no logout control')
    const account = await registerUser(request, 'shell', 'E2E Shell')
    const { context, page } = await openUserContext(browser, account.user)
    try {
      const controls = {
        chatsLink: await page.getByRole('link', { name: 'Chats' }).count(),
        profileLink: await page.getByRole('link', { name: 'Profile' }).count(),
        settingsLink: await page.getByRole('link', { name: 'Settings' }).count(),
        logout: await page.getByRole('button', { name: /log out|logout|sign out/i }).count(),
      }

      expect(controls).toMatchObject({
        chatsLink: 1,
        profileLink: 1,
        settingsLink: 1,
        logout: 1,
      })
    } finally {
      await context.close()
    }
  })

  test('returns to the requested protected route after login [BUG-041]', async ({ browser, request }) => {
    test.fail(true, 'BUG-041: login always navigates to / instead of the originally requested route')
    const account = await registerUser(request, 'return', 'E2E Return')
    const { context } = await createUserContext(browser, account.user)
    try {
      const page = await context.newPage()
      await page.goto('/profile')
      await expect(page).toHaveURL(/\/login$/)

      await page.getByPlaceholder('Email or username').fill(account.user.username)
      await page.getByPlaceholder('Password').fill(account.user.password)
      await page.getByRole('button', { name: 'Sign in' }).click()

      await expect(page).toHaveURL(/\/profile$/, { timeout: 3000 })
      await expect(page.getByPlaceholder('Display name')).toBeVisible()
    } finally {
      await context.close()
    }
  })
})
