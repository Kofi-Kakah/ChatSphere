import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('login screen passes the WCAG A/AA axe scan', async ({ page }, testInfo) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  await testInfo.attach('axe-login-results', {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  })

  expect(results.violations).toEqual([])
})
