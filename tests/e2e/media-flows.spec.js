import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { closePair, createDirectPair, openFirstConversation } from '../helpers/flows.js'
import { API_URL } from '../helpers/users.js'

const validPng = readFileSync(fileURLToPath(new URL('../assets/valid.png', import.meta.url))).toString('base64')

test.describe('E2E media composer and shared-media UI (5.10, 5.11)', () => {
  test('offers photo and file attachment controls', async ({ browser, request }) => {
    const pair = await createDirectPair(browser, request, { prefixA: 'mda', prefixB: 'mdb' })
    try {
      await openFirstConversation(pair.a.page)
      await expect(
        pair.a.page.getByRole('button', { name: /attach|photo|image|file|upload/i }).first(),
      ).toBeVisible({ timeout: 2000 })
    } finally {
      await closePair(pair)
    }
  })

  test('provides a file input for uploads', async ({ browser, request }) => {
    const pair = await createDirectPair(browser, request, { prefixA: 'mfa', prefixB: 'mfb' })
    try {
      await openFirstConversation(pair.a.page)
      await expect(pair.a.page.locator('input[type="file"]').first()).toHaveCount(1, { timeout: 2000 })
    } finally {
      await closePair(pair)
    }
  })

  test('starts a REST upload when an image is pasted into the composer', async ({ browser, request }) => {
    const pair = await createDirectPair(browser, request, { prefixA: 'mpa', prefixB: 'mpb' })
    try {
      await openFirstConversation(pair.a.page)
      const uploadRequest = pair.a.page
        .waitForRequest((req) => req.url().includes('/api/uploads') && req.method() === 'POST', { timeout: 3000 })
        .catch(() => null)
      await pair.a.page.evaluate((base64) => {
        const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
        const dataTransfer = new DataTransfer()
        dataTransfer.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }))
        const target = document.querySelector('textarea')
        const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
        Object.defineProperty(event, 'clipboardData', { value: dataTransfer })
        target.dispatchEvent(event)
      }, validPng)
      expect(await uploadRequest).not.toBeNull()
    } finally {
      await closePair(pair)
    }
  })

  test('offers a mic control for voice messages', async ({ browser, request }) => {
    const pair = await createDirectPair(browser, request, { prefixA: 'mva', prefixB: 'mvb' })
    try {
      await openFirstConversation(pair.a.page)
      await expect(
        pair.a.page.getByRole('button', { name: /mic|voice|record/i }).first(),
      ).toBeVisible({ timeout: 2000 })
    } finally {
      await closePair(pair)
    }
  })

  test('exposes Photos, Files, and Audio shared-media tabs', async ({ browser, request }) => {
    const pair = await createDirectPair(browser, request, { prefixA: 'mta', prefixB: 'mtb' })
    try {
      await openFirstConversation(pair.a.page)
      await expect(pair.a.page.getByRole('tab', { name: 'Photos' })).toBeVisible({ timeout: 2000 })
      await expect(pair.a.page.getByRole('tab', { name: 'Files' })).toBeVisible({ timeout: 2000 })
      await expect(pair.a.page.getByRole('tab', { name: 'Audio' })).toBeVisible({ timeout: 2000 })
    } finally {
      await closePair(pair)
    }
  })
})
