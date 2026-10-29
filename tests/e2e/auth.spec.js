import { expect, test } from '@playwright/test'
import { createLoggedInContext, loginViaUi, registerViaApi, uniqueUser } from '../helpers/users.js'

test.describe('auth smoke', () => {
  test('registers through the API, then logs in through the UI', async ({ page, request }) => {
    const user = uniqueUser('e2e')
    const registration = await registerViaApi(request, user)
    expect(registration.accessToken).toBeTruthy()
    expect(JSON.stringify(registration)).not.toMatch(/passwordHash/i)

    await loginViaUi(page, { identifier: user.email, password: user.password })

    await expect(page.getByText('Select a chat')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Login' })).toHaveCount(0)
  })

  test('shows inline validation when the login form is empty', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Required')).toHaveCount(2)
    await expect(page).toHaveURL(/\/login$/)
  })

  test('keeps two logged-in users in separate browser contexts', async ({ browser }) => {
    const first = await createLoggedInContext(browser, { prefix: 'e2e' })
    const second = await createLoggedInContext(browser, { prefix: 'e2e' })
    try {
      await expect(first.page.getByText('Select a chat')).toBeVisible()
      await expect(second.page.getByText('Select a chat')).toBeVisible()
      await expect(first.page.getByRole('heading', { name: 'Login' })).toHaveCount(0)
      await expect(second.page.getByRole('heading', { name: 'Login' })).toHaveCount(0)
      expect(first.user.username).not.toBe(second.user.username)
    } finally {
      await first.context.close()
      await second.context.close()
    }
  })
})
