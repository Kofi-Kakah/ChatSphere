import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import {
  activeElementInfo,
  openSeededChat,
  tabTo,
} from '../helpers/appearance.js'
import {
  createDirectViaApi,
  expectMessageVisible,
  openUserContext,
  registerUser,
  waitForSocket,
} from '../helpers/flows.js'
import { API_URL, APP_URL, loginViaUi, uniqueUser } from '../helpers/users.js'

const validPng = readFileSync(fileURLToPath(new URL('../assets/valid.png', import.meta.url)))

function hasVisibleFocus(info) {
  if (!info) return false
  if (info.boxShadow && info.boxShadow !== 'none') return true
  return Boolean(info.outlineStyle && info.outlineStyle !== 'none' && parseFloat(info.outlineWidth) > 0)
}

test.describe('Keyboard-only walkthrough (6.2)', () => {
  test('register and login can be completed from the keyboard with visible focus', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: APP_URL })
    const page = await context.newPage()
    const credentials = uniqueUser('kbd')
    try {
      await page.goto('/register')
      const seen = []
      for (const [placeholder, value] of [
        ['Username', credentials.username],
        ['Email', credentials.email],
        ['Display name', credentials.displayName],
        ['Password', credentials.password],
      ]) {
        const stop = await tabTo(page, (info) => info.placeholder === placeholder)
        expect(stop, `tab stop for ${placeholder}`).not.toBeNull()
        seen.push({ placeholder, ...stop })
        await page.keyboard.type(value)
      }
      const submit = await tabTo(page, (info) => info.label === 'Create account')
      expect(submit, 'Create account button').not.toBeNull()
      seen.push({ placeholder: 'submit', ...submit })
      console.log(`[keyboard:register] ${JSON.stringify(seen)}`)
      for (const stop of seen) {
        expect(hasVisibleFocus(stop), `visible focus on ${stop.placeholder}`).toBe(true)
      }
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/\/$/)
    } finally {
      await context.close()
    }

    const loginContext = await browser.newContext({ baseURL: APP_URL })
    const loginPage = await loginContext.newPage()
    try {
      await loginPage.goto('/login')
      await tabTo(loginPage, (info) => info.placeholder === 'Email or username')
      await loginPage.keyboard.type(credentials.username)
      await tabTo(loginPage, (info) => info.placeholder === 'Password')
      await loginPage.keyboard.type(credentials.password)
      const signIn = await tabTo(loginPage, (info) => info.label === 'Sign in')
      expect(signIn, 'Sign in button').not.toBeNull()
      expect(hasVisibleFocus(signIn), 'visible focus on Sign in').toBe(true)
      await loginPage.keyboard.press('Enter')
      await expect(loginPage).toHaveURL(/\/$/)
    } finally {
      await loginContext.close()
    }
  })

  test('conversation rows are reachable and operable from the keyboard', async ({ browser, request }) => {
    test.fail(true, 'BUG-069: conversation rows are non-focusable divs with no button/link semantics')
    const alice = await registerUser(request, 'krowa', 'Alice Row')
    const bob = await registerUser(request, 'krowb', 'Bob Row')
    await createDirectViaApi(request, alice, bob.user._id)
    const context = await browser.newContext({ baseURL: APP_URL })
    const page = await context.newPage()
    try {
      await loginViaUi(page, { identifier: alice.user.username, password: alice.user.password })
      const row = page.locator('aside .cursor-pointer').first()
      await expect(row).toContainText('Direct chat')
      const semantics = await row.evaluate((element) => ({
        tabIndex: element.tabIndex,
        role: element.getAttribute('role'),
        tag: element.tagName.toLowerCase(),
      }))
      const visited = []
      for (let attempt = 0; attempt < 25; attempt += 1) {
        await page.keyboard.press('Tab')
        visited.push(await activeElementInfo(page))
      }
      console.log(`[keyboard:rows] semantics=${JSON.stringify(semantics)} visited=${JSON.stringify(visited)}`)
      expect(
        semantics.tabIndex >= 0 || ['button', 'link', 'option'].includes(semantics.role),
        'conversation row participates in the tab order',
      ).toBe(true)
      expect(
        visited.some((info) => info?.label?.includes('Direct chat')),
        'Tab focuses the conversation row',
      ).toBe(true)
    } finally {
      await context.close()
    }
  })

  test('a chat can be started and messaged from the keyboard alone', async ({ browser, request }) => {
    const alice = await registerUser(request, 'ksta', 'Alice Start')
    const bob = await registerUser(request, 'kstb', 'Bob Start')
    const context = await browser.newContext({ baseURL: APP_URL })
    const page = await context.newPage()
    try {
      await loginViaUi(page, { identifier: alice.user.username, password: alice.user.password })
      page.once('dialog', (dialog) => dialog.accept(bob.user.username))
      const newButton = await tabTo(page, (info) => info.label === 'New')
      expect(newButton, 'New chat button').not.toBeNull()
      expect(hasVisibleFocus(newButton), 'visible focus on New').toBe(true)
      await page.keyboard.press('Enter')
      await expect(page.getByPlaceholder('Type a message')).toBeVisible()

      const composer = await tabTo(page, (info) => info.placeholder === 'Type a message')
      expect(composer, 'composer textarea').not.toBeNull()
      expect(hasVisibleFocus(composer), 'visible focus in the composer').toBe(true)
      await page.keyboard.type('Started from the keyboard')
      await page.keyboard.press('Enter')
      await expectMessageVisible(page, 'Started from the keyboard')
    } finally {
      await context.close()
    }
  })

  test('composer controls show visible focus when tabbed to', async ({ browser, request }) => {
    const chat = await openSeededChat(browser, request, {
      prefixA: 'kfoca',
      prefixB: 'kfocb',
    })
    try {
      const stops = []
      for (const label of ['Attach file', 'Record voice message', '🙂', 'Type a message', 'Send']) {
        const stop = await tabTo(chat.page, (info) =>
          label === 'Type a message' ? info.placeholder === label : info.label === label,
        )
        expect(stop, `tab stop for ${label}`).not.toBeNull()
        stops.push({ label, ...stop })
      }
      console.log(`[keyboard:focus] ${JSON.stringify(stops)}`)
      for (const stop of stops) {
        expect(hasVisibleFocus(stop), `visible focus on ${stop.label}`).toBe(true)
      }
    } finally {
      await chat.context.close()
    }
  })

  test('the attach menu selects a photo from the keyboard', async ({ browser, request }) => {
    const chat = await openSeededChat(browser, request, {
      prefixA: 'kata',
      prefixB: 'katb',
    })
    try {
      const attach = await tabTo(chat.page, (info) => info.label === 'Attach file')
      expect(attach, 'Attach file button').not.toBeNull()
      expect(hasVisibleFocus(attach), 'visible focus on Attach').toBe(true)
      await chat.page.keyboard.press('Enter')
      await expect(chat.page.getByRole('menu')).toBeVisible()

      const photo = await tabTo(chat.page, (info) => info.label === 'Photo')
      expect(photo, 'Photo menu item').not.toBeNull()
      expect(hasVisibleFocus(photo), 'visible focus on Photo').toBe(true)

      const chooserPromise = chat.page.waitForEvent('filechooser')
      await chat.page.keyboard.press('Enter')
      const chooser = await chooserPromise
      await chooser.setFiles(fileURLToPath(new URL('../assets/valid.png', import.meta.url)))
      await expect(chat.page.getByText('valid.png')).toBeVisible({ timeout: 15_000 })
    } finally {
      await chat.context.close()
    }
  })

  test('the attach menu closes on Escape', async ({ browser, request }) => {
    test.fail(true, 'BUG-070: the attach menu stays open after Escape')
    const chat = await openSeededChat(browser, request, {
      prefixA: 'kesca',
      prefixB: 'kescb',
    })
    try {
      const attach = await tabTo(chat.page, (info) => info.label === 'Attach file')
      expect(attach, 'Attach file button').not.toBeNull()
      await chat.page.keyboard.press('Enter')
      const menu = chat.page.getByRole('menu')
      await expect(menu).toBeVisible()
      await chat.page.keyboard.press('Escape')
      await expect(menu).toBeHidden()
    } finally {
      await chat.context.close()
    }
  })

  test('voice recording can be started and cancelled from the keyboard', async ({ browser, request, browserName }) => {
    test.skip(browserName !== 'chromium', 'Fake microphone is configured for Chromium only')
    const chat = await openSeededChat(browser, request, {
      prefixA: 'kmica',
      prefixB: 'kmicb',
    })
    try {
      const mic = await tabTo(chat.page, (info) => info.label === 'Record voice message')
      expect(mic, 'Record voice message button').not.toBeNull()
      expect(hasVisibleFocus(mic), 'visible focus on Record').toBe(true)
      await chat.page.keyboard.press('Enter')
      await expect(chat.page.getByRole('timer')).toBeVisible({ timeout: 10_000 })

      const cancel = await tabTo(chat.page, (info) => info.label === 'Cancel', 15)
      expect(cancel, 'Cancel recording button').not.toBeNull()
      expect(hasVisibleFocus(cancel), 'visible focus on Cancel').toBe(true)
      await chat.page.keyboard.press('Enter')
      await expect(chat.page.getByPlaceholder('Type a message')).toBeVisible()
    } finally {
      await chat.context.close()
    }
  })

  test('incoming messages are announced in a polite live region', async ({ browser, request }) => {
    test.fail(true, 'BUG-071: open-chat messages have no polite live region')
    const chat = await openSeededChat(browser, request, {
      prefixA: 'kliva',
      prefixB: 'klivb',
    })
    const bob = await openUserContext(browser, chat.bob.user)
    const text = 'Live region announcement'
    try {
      await waitForSocket(bob.page)
      await bob.page.evaluate(
        async ({ conversationId, body }) => {
          const ack = await new Promise((resolve) => {
            window.__socket.emit(
              'message:send',
              { conversationId, clientId: crypto.randomUUID(), type: 'text', text: body },
              resolve,
            )
          })
          if (!ack?.ok) throw new Error(JSON.stringify(ack))
        },
        { conversationId: chat.conversation._id, body: text },
      )
      await expectMessageVisible(chat.page, text)

      const live = await chat.page.evaluate((body) => {
        const regions = Array.from(
          document.querySelectorAll('[aria-live], [role="status"], [role="log"], [role="alert"]'),
        )
        return {
          regions: regions.map((region) => ({
            ariaLive: region.getAttribute('aria-live'),
            role: region.getAttribute('role'),
            text: (region.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          })),
          announced: regions.some((region) => (region.textContent || '').includes(body)),
        }
      }, text)
      console.log(`[keyboard:live] ${JSON.stringify(live)}`)
      expect(live.announced, 'new message text present in a polite live region').toBe(true)
    } finally {
      await bob.context.close()
      await chat.context.close()
    }
  })

  test('the image lightbox traps focus and returns it to the trigger', async ({ browser, request }) => {
    test.fail(true, 'BUG-072: the lightbox never receives, traps, or restores focus')
    const chat = await openSeededChat(browser, request, {
      prefixA: 'kliba',
      prefixB: 'klibb',
    })
    try {
      const upload = await request.post(`${API_URL}/uploads`, {
        headers: { Authorization: `Bearer ${chat.alice.accessToken}` },
        multipart: {
          file: { name: 'focus.png', mimeType: 'image/png', buffer: validPng },
        },
      })
      expect(upload.ok()).toBeTruthy()
      const { uploadId } = await upload.json()
      await chat.page.evaluate(
        async ({ conversationId, id }) => {
          const ack = await new Promise((resolve) => {
            window.__socket.emit(
              'message:send',
              { conversationId, clientId: crypto.randomUUID(), type: 'image', uploadIds: [id] },
              resolve,
            )
          })
          if (!ack?.ok) throw new Error(JSON.stringify(ack))
        },
        { conversationId: chat.conversation._id, id: uploadId },
      )

      const trigger = chat.page.getByRole('button', { name: 'Open focus.png' })
      await expect(trigger).toBeVisible()
      await trigger.click()
      const dialog = chat.page.getByRole('dialog', { name: 'Image viewer' })
      await expect(dialog).toBeVisible()

      const insideAfterOpen = await chat.page.evaluate(() => {
        const element = document.querySelector('[role="dialog"]')
        return Boolean(element && element.contains(document.activeElement))
      })
      const tabStopsInside = []
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await chat.page.keyboard.press('Tab')
        tabStopsInside.push(
          await chat.page.evaluate(() => {
            const element = document.querySelector('[role="dialog"]')
            return Boolean(element && element.contains(document.activeElement))
          }),
        )
      }
      await chat.page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      const afterClose = await chat.page.evaluate(
        () => document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName || '',
      )
      console.log(
        `[keyboard:lightbox] insideAfterOpen=${insideAfterOpen} tabStopsInside=${JSON.stringify(tabStopsInside)} afterClose=${afterClose}`,
      )
      expect(insideAfterOpen, 'focus moves into the dialog when it opens').toBe(true)
      expect(tabStopsInside.every(Boolean), 'focus stays inside the dialog while tabbing').toBe(true)
      expect(afterClose, 'focus returns to the image trigger').toBe('Open focus.png')
    } finally {
      await chat.context.close()
    }
  })

  test('the appearance controls are reachable from the keyboard', async ({ browser, request }) => {
    test.fail(true, 'BUG-040: there is no rail or theme control anywhere in the app')
    const chat = await openSeededChat(browser, request, {
      prefixA: 'kthea',
      prefixB: 'ktheb',
    })
    try {
      const labels = await chat.page.evaluate(() =>
        Array.from(document.querySelectorAll('button, [role="button"], a[href]')).map((element) =>
          (element.getAttribute('aria-label') || element.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 48),
        ),
      )
      console.log(`[keyboard:appearance] ${JSON.stringify(labels)}`)
      expect(
        labels.some((label) => /theme|appearance|dark mode|light mode/i.test(label)),
        'theme control present',
      ).toBe(true)
    } finally {
      await chat.context.close()
    }
  })

  test('the chat background picker is reachable from the keyboard', async ({ browser, request }) => {
    test.fail(true, 'BUG-050: there is no chat background picker or theme control')
    const chat = await openSeededChat(browser, request, {
      prefixA: 'kboaa',
      prefixB: 'kboab',
    })
    try {
      const labels = await chat.page.evaluate(() =>
        Array.from(document.querySelectorAll('button, [role="button"]')).map((element) =>
          (element.getAttribute('aria-label') || element.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 48),
        ),
      )
      console.log(`[keyboard:backgrounds] ${JSON.stringify(labels)}`)
      expect(
        labels.some((label) => /chat background|chat theme|love|friendship|battle/i.test(label)),
        'chat background control present',
      ).toBe(true)
    } finally {
      await chat.context.close()
    }
  })

  test('call controls are reachable from the keyboard', async ({ browser, request }) => {
    test.fail(true, 'BUG-062: the client has no call control or call UI')
    const chat = await openSeededChat(browser, request, {
      prefixA: 'kcala',
      prefixB: 'kcalb',
    })
    try {
      const labels = await chat.page.evaluate(() =>
        Array.from(document.querySelectorAll('button, [role="button"]')).map((element) =>
          (element.getAttribute('aria-label') || element.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 48),
        ),
      )
      console.log(`[keyboard:calls] ${JSON.stringify(labels)}`)
      expect(
        labels.some((label) => /call|video/i.test(label)),
        'call control present',
      ).toBe(true)
    } finally {
      await chat.context.close()
    }
  })
})
