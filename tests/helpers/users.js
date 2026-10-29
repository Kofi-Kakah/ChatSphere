import { expect } from '@playwright/test'

export const API_URL = 'http://127.0.0.1:3101/api'
export const APP_URL = 'http://127.0.0.1:5175'

export function uniqueUser(prefix = 'e2e') {
  const suffix = `${Date.now()}`.slice(-10) + String(Math.floor(Math.random() * 90) + 10)
  return {
    username: `${prefix}${suffix}`.slice(0, 20),
    email: `${prefix}.${suffix}@example.test`,
    displayName: 'E2E User',
    password: `E2e!Pass${suffix}`,
  }
}

export async function registerViaApi(request, user, apiUrl = API_URL) {
  const response = await request.post(`${apiUrl}/auth/register`, { data: user })
  if (!response.ok()) {
    throw new Error(`register failed (${response.status()}): ${await response.text()}`)
  }
  return response.json()
}

export async function loginViaUi(page, { identifier, password }) {
  await page.goto('/login')
  await page.getByPlaceholder('Email or username').fill(identifier)
  await page.getByPlaceholder('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/$/)
}

export async function createLoggedInContext(browser, { baseURL = APP_URL, apiUrl = API_URL, prefix = 'e2e' } = {}) {
  const context = await browser.newContext({ baseURL })
  const user = uniqueUser(prefix)
  const registration = await context.request.post(`${apiUrl}/auth/register`, { data: user })
  if (!registration.ok()) {
    throw new Error(`register failed (${registration.status()}): ${await registration.text()}`)
  }
  const page = await context.newPage()
  await loginViaUi(page, { identifier: user.username, password: user.password })
  return { context, page, user }
}
