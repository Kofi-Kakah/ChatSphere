import { expect, test } from '@playwright/test'
import { closePair, createDirectPair, messageRow, openFirstConversation } from '../helpers/flows.js'
import { mediaPermissions } from '../helpers/media.js'

const CALL_CONTEXT = { permissions: mediaPermissions }

function callButton(page) {
  return page.locator('main header').getByRole('button', { name: /call/i }).first()
}

function endButton(page) {
  return page.getByRole('button', { name: /end call|hang up|^end$/i }).first()
}

async function framesDecoded(page) {
  return page.$$eval('video', (videos) => videos.filter((video) => video.videoWidth > 0).length)
}

function openPair(browser, request, prefix) {
  return createDirectPair(browser, request, {
    prefixA: `${prefix}a`,
    prefixB: `${prefix}b`,
    contextOptionsA: CALL_CONTEXT,
    contextOptionsB: CALL_CONTEXT,
  })
}

async function ringAndAccept(caller, callee) {
  await callButton(caller.page).click()
  const accept = callee.page.getByRole('button', { name: /accept/i }).first()
  await expect(accept).toBeVisible({ timeout: 10_000 })
  await accept.click()
  await expect(endButton(caller.page)).toBeVisible({ timeout: 10_000 })
  await expect(endButton(callee.page)).toBeVisible({ timeout: 10_000 })
  await expect.poll(() => framesDecoded(caller.page), { timeout: 15_000 }).toBeGreaterThanOrEqual(2)
  await expect.poll(() => framesDecoded(callee.page), { timeout: 15_000 }).toBeGreaterThanOrEqual(2)
}

async function hangUp(page) {
  await endButton(page).click()
  await expect(endButton(page)).toBeHidden({ timeout: 10_000 })
}

test.describe('E2E calling (5.14)', () => {
  test.use({ actionTimeout: 5000 })
  test.skip(({ browserName }) => browserName !== 'chromium', 'Fake camera and microphone are configured for Chromium only')
  test.fail(true, 'BUG-062: the client has no call UI, call state machine, or WebRTC session')

  test('CALL-UI: a direct chat exposes a call control and starts an outgoing call', async ({ browser, request }) => {
    const pair = await openPair(browser, request, 'cva')
    try {
      await openFirstConversation(pair.a.page)
      await expect(callButton(pair.a.page)).toBeVisible({ timeout: 5000 })
      await callButton(pair.a.page).click()

      await expect(endButton(pair.a.page)).toBeVisible({ timeout: 10_000 })
      await expect(pair.a.page.getByRole('button', { name: /mute/i })).toBeVisible()
      await expect(pair.a.page.getByRole('button', { name: /camera/i })).toBeVisible()
      await expect.poll(() => framesDecoded(pair.a.page), { timeout: 10_000 }).toBeGreaterThanOrEqual(1)

      await hangUp(pair.a.page)
      await expect(callButton(pair.a.page)).toBeVisible()
    } finally {
      await closePair(pair)
    }
  })

  test('CALL-001: an incoming call can be accepted and both sides decode video', async ({ browser, request }) => {
    const pair = await openPair(browser, request, 'cvh')
    try {
      await openFirstConversation(pair.a.page)
      await openFirstConversation(pair.b.page)
      await ringAndAccept(pair.a, pair.b)

      await expect(pair.a.page.getByRole('button', { name: /mute/i })).toBeVisible()
      await expect(pair.b.page.getByRole('button', { name: /mute/i })).toBeVisible()

      await hangUp(pair.a.page)
      await expect(endButton(pair.b.page)).toBeHidden({ timeout: 10_000 })
    } finally {
      await closePair(pair)
    }
  })

  test('CALL-003: declining ends the call and logs it in the chat', async ({ browser, request }) => {
    const pair = await openPair(browser, request, 'cvd')
    try {
      await openFirstConversation(pair.a.page)
      await openFirstConversation(pair.b.page)
      await callButton(pair.a.page).click()

      const decline = pair.b.page.getByRole('button', { name: /decline/i }).first()
      await expect(decline).toBeVisible({ timeout: 10_000 })
      await decline.click()

      await expect(endButton(pair.a.page)).toBeHidden({ timeout: 10_000 })
      await expect(pair.a.page.getByText(/declined/i).first()).toBeVisible({ timeout: 10_000 })
      await expect(messageRow(pair.a.page, /declined/i)).toBeVisible({ timeout: 10_000 })
    } finally {
      await closePair(pair)
    }
  })

  test('CALL-011: mute and camera controls reflect their state', async ({ browser, request }) => {
    const pair = await openPair(browser, request, 'cvc')
    try {
      await openFirstConversation(pair.a.page)
      await openFirstConversation(pair.b.page)
      await ringAndAccept(pair.a, pair.b)

      const mute = pair.a.page.getByRole('button', { name: /^mute$|mute microphone/i }).first()
      await mute.click()
      await expect(pair.a.page.getByRole('button', { name: /unmute/i }).first()).toBeVisible()

      const camera = pair.a.page.getByRole('button', { name: /^camera$|turn off camera/i }).first()
      await camera.click()
      await expect(
        pair.a.page.getByRole('button', { name: /camera off|turn on camera|enable camera/i }).first(),
      ).toBeVisible()

      await hangUp(pair.a.page)
    } finally {
      await closePair(pair)
    }
  })

  test('CALL-013: hanging up cleans the call screen and a new call still connects (10 repeats)', async ({ browser, request }) => {
    test.setTimeout(240_000)
    const pair = await openPair(browser, request, 'cvr')
    try {
      await openFirstConversation(pair.a.page)
      await openFirstConversation(pair.b.page)
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        await ringAndAccept(pair.a, pair.b)
        await expect.poll(() => framesDecoded(pair.b.page), { timeout: 15_000 }).toBeGreaterThanOrEqual(2)
        await hangUp(pair.a.page)
        await expect(endButton(pair.b.page)).toBeHidden({ timeout: 10_000 })
        await expect(callButton(pair.a.page)).toBeVisible()
      }
    } finally {
      await closePair(pair)
    }
  })

  test('CALL-018: completed calls log their duration and appear in the Calls history', async ({ browser, request }) => {
    const pair = await openPair(browser, request, 'cvl')
    try {
      await openFirstConversation(pair.a.page)
      await openFirstConversation(pair.b.page)
      await ringAndAccept(pair.a, pair.b)
      await hangUp(pair.a.page)

      await expect(pair.a.page.getByText(/video call\s*[·-]\s*\d+:\d{2}/i).first()).toBeVisible({ timeout: 10_000 })

      const callsNav = pair.a.page
        .getByRole('link', { name: /^calls$/i })
        .or(pair.a.page.getByRole('button', { name: /^calls$/i }))
        .first()
      await expect(callsNav).toBeVisible({ timeout: 5000 })
      await callsNav.click()

      await expect(pair.a.page.getByText(/outgoing/i).first()).toBeVisible({ timeout: 10_000 })
      await expect(pair.a.page.getByText(/completed/i).first()).toBeVisible({ timeout: 10_000 })
    } finally {
      await closePair(pair)
    }
  })
})
