import { expect, test } from '@playwright/test'
import {
  closePair,
  createDirectPair,
  openFirstConversation,
} from '../helpers/flows.js'

test.describe('E2E chat background flows (5.12)', () => {
  test('opens a chat theme picker from the info panel [BUG-050]', async ({ browser, request }) => {
    test.fail(true, 'BUG-050: the chat header has no info panel toggle and no chat background picker exists')
    const pair = await createDirectPair(browser, request, {
      prefixA: 'thea',
      nameA: 'Alice Theme',
      prefixB: 'theb',
      nameB: 'Bob Theme',
    })
    try {
      await openFirstConversation(pair.a.page)

      const infoToggle = pair.a.page.locator('main header').getByRole('button', { name: /info|details/i })
      await expect(infoToggle).toHaveCount(1)
      await infoToggle.click()

      const picker = pair.a.page.getByRole('region', { name: /chat background|chat theme/i })
      await expect(picker).toBeVisible()
      for (const theme of ['Default', 'Love', 'Friendship', 'Battle']) {
        await expect(picker.getByRole('button', { name: theme })).toBeVisible()
      }
    } finally {
      await closePair(pair)
    }
  })

  test('applies a chat background for both participants in real time [BUG-050]', async ({ browser, request }) => {
    test.fail(true, 'BUG-050: there is no theme control, no data-chat-theme rendering, and no live theme sync')
    const pair = await createDirectPair(browser, request, {
      prefixA: 'synca',
      nameA: 'Alice Sync Theme',
      prefixB: 'synctb',
      nameB: 'Bob Sync Theme',
    })
    try {
      await openFirstConversation(pair.a.page)
      await openFirstConversation(pair.b.page)

      const themeControl = pair.a.page.getByRole('button', { name: /chat background|chat theme|love/i }).first()
      await expect(themeControl).toBeVisible({ timeout: 3000 })
      await themeControl.click()
      await pair.a.page.getByRole('button', { name: 'Love' }).click()

      await expect(pair.a.page.locator('[data-chat-theme="love"]').first()).toBeVisible()
      await expect(pair.b.page.locator('[data-chat-theme="love"]').first()).toBeVisible()
    } finally {
      await closePair(pair)
    }
  })
})
