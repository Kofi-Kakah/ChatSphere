import { expect, test } from '@playwright/test'
import {
  accessTokenFromPage,
  closePair,
  createDirectPair,
  fetchMe,
  navigateInApp,
  openFirstConversation,
  openUserContext,
  registerUser,
} from '../helpers/flows.js'
import { API_URL } from '../helpers/users.js'

async function openProfile(page) {
  await navigateInApp(page, '/profile')
  await expect(page.getByPlaceholder('Display name')).toBeVisible()
}

test.describe('E2E profile flows (5.2)', () => {
  test('edits display name, username, and bio, and the change persists', async ({ browser, request }) => {
    const account = await registerUser(request, 'prof', 'E2E Profile')
    const { context, page } = await openUserContext(browser, account.user)
    try {
      await openProfile(page)
      expect(await page.getByPlaceholder('Display name').inputValue()).toBe(account.user.displayName)

      const renamed = `renamed${Date.now()}`.slice(0, 20)
      await page.getByPlaceholder('Display name').fill('Renamed User')
      await page.getByPlaceholder('Username').fill(renamed)
      await page.getByPlaceholder('Bio').fill('Testing bio, updated through the profile form.')
      await page.getByRole('button', { name: 'Save' }).click()

      await expect(page.getByText('Saved')).toBeVisible()

      const token = await accessTokenFromPage(page)
      const me = await fetchMe(request, token)
      expect(me).toMatchObject({
        displayName: 'Renamed User',
        username: renamed,
        bio: 'Testing bio, updated through the profile form.',
      })

      await navigateInApp(page, '/')
      await openProfile(page)
      expect(await page.getByPlaceholder('Display name').inputValue()).toBe('Renamed User')
      expect(await page.getByPlaceholder('Username').inputValue()).toBe(renamed)
      expect(await page.getByPlaceholder('Bio').inputValue()).toBe('Testing bio, updated through the profile form.')
    } finally {
      await context.close()
    }
  })

  test('reports a taken username and leaves the current username unchanged', async ({ browser, request }) => {
    const alice = await registerUser(request, 'namea', 'Alice Name')
    const bob = await registerUser(request, 'nameb', 'Bob Name')
    const { context, page } = await openUserContext(browser, alice.user)
    try {
      await openProfile(page)

      await page.getByPlaceholder('Username').fill(bob.user.username)
      await page.getByRole('button', { name: 'Save' }).click()

      await expect(page.getByText('Username taken')).toBeVisible()
      const me = await fetchMe(request, await accessTokenFromPage(page))
      expect(me.username).toBe(alice.user.username)
    } finally {
      await context.close()
    }
  })

  test('offers privacy controls for online status, last seen, and read receipts [BUG-042]', async ({ browser, request }) => {
    test.fail(true, 'BUG-042: the profile form has no privacy controls')
    const account = await registerUser(request, 'priv', 'E2E Privacy')
    const { context, page } = await openUserContext(browser, account.user)
    try {
      await openProfile(page)

      const controls = {
        showOnlineStatus: await page.getByLabel(/show online/i).count(),
        showLastSeen: await page.getByLabel(/show last seen|last seen/i).count(),
        sendReadReceipts: await page.getByLabel(/read receipts/i).count(),
      }

      expect(controls).toMatchObject({
        showOnlineStatus: 1,
        showLastSeen: 1,
        sendReadReceipts: 1,
      })
    } finally {
      await context.close()
    }
  })

  test('offers avatar upload with a preview [SD-003]', async ({ browser, request }) => {
    test.fail(true, 'SD-003: avatar upload endpoint and profile control are unimplemented')
    const account = await registerUser(request, 'avatar', 'E2E Avatar')
    const { context, page } = await openUserContext(browser, account.user)
    try {
      await openProfile(page)

      const controls = {
        fileInputs: await page.locator('input[type="file"]').count(),
        uploadButtons: await page.getByRole('button', { name: /avatar|upload photo|change photo/i }).count(),
      }

      expect(controls.fileInputs + controls.uploadButtons).toBeGreaterThan(0)
    } finally {
      await context.close()
    }
  })

  test('opens another user profile from a direct chat [BUG-043]', async ({ browser, request }) => {
    test.fail(true, 'BUG-043: the chat header has no user profile entry point and no other-user profile screen exists')
    const pair = await createDirectPair(browser, request, {
      prefixA: 'viewa',
      nameA: 'Alice Viewer',
      prefixB: 'viewb',
      nameB: 'Bob Viewed',
    })
    try {
      await openFirstConversation(pair.a.page)

      const profileEntryPoints = {
        headerUserLink: await pair.a.page.locator('main header').getByRole('link').count(),
        headerProfileButton: await pair.a.page.locator('main header').getByRole('button', { name: /profile|info/i }).count(),
      }

      expect(profileEntryPoints).toMatchObject({
        headerUserLink: 1,
        headerProfileButton: 1,
      })
    } finally {
      await closePair(pair)
    }
  })

  test('shows profile changes to the other participant through the API', async ({ browser, request }) => {
    const pair = await createDirectPair(browser, request, {
      prefixA: 'syncp',
      nameA: 'Alice Sync',
      prefixB: 'syncq',
      nameB: 'Bob Sync',
    })
    try {
      await navigateInApp(pair.a.page, '/profile')
      await pair.a.page.getByPlaceholder('Display name').fill('Alice Updated')
      await pair.a.page.getByRole('button', { name: 'Save' }).click()
      await expect(pair.a.page.getByText('Saved')).toBeVisible()

      const response = await request.get(`${API_URL}/users/${pair.alice.user._id}`, {
        headers: { Authorization: `Bearer ${pair.bob.accessToken}` },
      })
      expect(response.ok()).toBeTruthy()
      const body = await response.json()
      expect(body.user.displayName).toBe('Alice Updated')
    } finally {
      await closePair(pair)
    }
  })
})
