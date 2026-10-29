// Testing.md Phase 13: a scripted exploratory/chaos session. Every action is
// numbered; anomalies are recorded with evidence instead of failing the run, so
// one broken step cannot hide the ones after it. Run with `npm run test:exploratory`.
import { test, expect } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  authHeaders,
  createDirectViaApi,
  createGroupViaApi,
  openUserContext,
  registerUser,
  waitForSocket,
} from '../helpers/flows.js'
import { API_URL, APP_URL } from '../helpers/users.js'

const EVIDENCE_DIR = fileURLToPath(new URL('../../docs/testing/evidence/', import.meta.url))
const RUN = process.env.CHAOS_RUN || 'run1'
const SHOT_DIR = `${EVIDENCE_DIR}phase13/`
const pngBase64 = readFileSync(fileURLToPath(new URL('../assets/valid.png', import.meta.url))).toString('base64')
const pdfBuffer = readFileSync(fileURLToPath(new URL('../assets/valid.pdf', import.meta.url)))
const exeBuffer = readFileSync(fileURLToPath(new URL('../assets/executable.exe', import.meta.url)))

function rows(page) {
  return page.locator('aside').first().locator('.cursor-pointer')
}
function row(page, name) {
  return rows(page).filter({ hasText: name })
}
function composer(page) {
  return page.getByPlaceholder('Type a message')
}
function header(page) {
  return page.locator('main header span').first()
}
function bubbles(page) {
  return page.locator('[data-message-id]')
}
async function openChat(page, name) {
  const matches = row(page, name)
  await expect(matches.first()).toBeVisible()
  await matches.first().click()
  await expect(header(page)).toHaveText(name)
}
async function clearAttachments(page) {
  for (let i = 0; i < 5; i += 1) {
    const chip = page.getByRole('button', { name: /^(Remove|Cancel upload for) / }).first()
    if (!(await chip.count())) return
    await chip.click().catch(() => {})
    await page.waitForTimeout(150)
  }
}
async function send(page, text) {
  await composer(page).fill(text)
  await composer(page).press('Enter')
}
async function navigateInApp(page, path) {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}
async function apiGet(request, token, path) {
  const response = await request.get(`${API_URL}${path}`, { headers: authHeaders(token) })
  return { status: response.status(), body: await response.json().catch(() => null) }
}
async function health(request) {
  const response = await request.get(`${API_URL}/health`)
  return response.status()
}
async function socketState(page) {
  return page.evaluate(() => ({ connected: window.__socket?.connected === true, id: window.__socket?.id || null }))
}
async function pasteFiles(page, files) {
  await page.evaluate((payload) => {
    const transfer = new DataTransfer()
    for (const file of payload) {
      const bytes = Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0))
      transfer.items.add(new File([bytes], file.name, { type: file.type }))
    }
    const target = document.querySelector('textarea')
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: transfer })
    target.dispatchEvent(event)
  }, files)
}
async function dropTemplate(page) {
  const payload = pngBase64
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }))
    const textarea = document.querySelector('textarea')
    const target = textarea.closest('div.border-t')
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  }, payload)
}

test('Phase 13 exploratory and chaos session', async ({ browser, request }) => {
  test.setTimeout(15 * 60_000)
  mkdirSync(SHOT_DIR, { recursive: true })
  const sessionStartedAt = Date.now()

  const alice = await registerUser(request, 'chaosa', 'Chaos Alice')
  const bob = await registerUser(request, 'chaosb', 'Chaos Bob')
  const carol = await registerUser(request, 'chaosc', 'Chaos Carol')
  const directAB = await createDirectViaApi(request, alice, bob.user._id)
  const directAC = await createDirectViaApi(request, alice, carol.user._id)
  const group = await createGroupViaApi(request, alice, [bob.user._id, carol.user._id], 'Chaos Group')
  for (const [conversation, name] of [[directAB, 'Chaos AB'], [directAC, 'Chaos AC']]) {
    const renamed = await request.patch(`${API_URL}/conversations/${conversation._id}`, {
      headers: authHeaders(alice.accessToken),
      data: { name },
    })
    expect(renamed.ok()).toBeTruthy()
  }

  const a = await openUserContext(browser, alice.user)
  const b = await openUserContext(browser, bob.user)
  const c = await openUserContext(browser, carol.user)
  const pages = { a: a.page, b: b.page, c: c.page }
  // A stray overlay must fail a step quickly instead of waiting out the whole test.
  for (const page of Object.values(pages)) page.setDefaultTimeout(20_000)

  const events = []
  for (const [label, page] of Object.entries(pages)) {
    page.on('console', (msg) => {
      if (msg.type() === 'error') events.push({ at: Date.now(), label, kind: 'console', text: msg.text() })
    })
    page.on('pageerror', (error) => events.push({ at: Date.now(), label, kind: 'pageerror', text: String(error?.message || error) }))
    page.on('requestfailed', (req) => {
      if (!/favicon/.test(req.url())) events.push({ at: Date.now(), label, kind: 'requestfailed', text: `${req.method()} ${req.url()} ${req.failure()?.errorText}` })
    })
  }
  for (const page of Object.values(pages)) await waitForSocket(page)

  const steps = []
  let stepNo = 0
  let acMarker = null
  async function step(name, fn) {
    stepNo += 1
    const id = stepNo
    const startedAt = Date.now()
    try {
      const result = (await fn()) ?? {}
      steps.push({ id, name, status: result.status || 'ok', note: result.note ?? null, ms: Date.now() - startedAt })
      console.log(`[chaos] ${String(id).padStart(2, '0')} ${name}: ${result.status || 'ok'}${result.note ? ` — ${result.note}` : ''}`)
      return result.value
    } catch (error) {
      const message = String(error?.message || error).split('\n')[0]
      steps.push({ id, name, status: 'error', note: message, ms: Date.now() - startedAt })
      console.log(`[chaos] ${String(id).padStart(2, '0')} ${name}: ERROR — ${message}`)
      await pages.a.keyboard.press('Escape').catch(() => {})
      await pages.a.screenshot({ path: `${SHOT_DIR}${RUN}-step-${String(id).padStart(2, '0')}.png` }).catch(() => {})
      return null
    }
  }
  const anomaly = (note) => ({ status: 'anomaly', note })
  const serverTextCount = async (conversationId, text) => {
    const { body } = await apiGet(request, alice.accessToken, `/conversations/${conversationId}/messages?limit=100`)
    return (body?.messages || []).filter((m) => m.text === text).length
  }

  try {
    // 1-10: baseline, send edge cases, composer abuse
    await step('three clients connect and list their conversations', async () => {
      const counts = { alice: await rows(pages.a).count(), bob: await rows(pages.b).count(), carol: await rows(pages.c).count() }
      return counts.alice === 3 && counts.bob === 2 && counts.carol === 2
        ? { note: `${counts.alice}/${counts.bob}/${counts.carol} rows` }
        : anomaly(`unexpected row counts ${JSON.stringify(counts)}`)
    })

    await step('open Chaos AB on alice and bob', async () => {
      await openChat(pages.a, 'Chaos AB')
      await openChat(pages.b, 'Chaos AB')
      return { note: 'both headers show Chaos AB' }
    })

    await step('baseline message is delivered to the other user', async () => {
      const text = 'baseline-1'
      await send(pages.a, text)
      await expect(pages.b.locator('[data-message-id]').filter({ hasText: text })).toHaveCount(1, { timeout: 15_000 })
      return { note: 'delivered exactly once to bob' }
    })

    await step('double Enter on one draft', async () => {
      const text = `double-enter-${Date.now()}`
      await composer(pages.a).fill(text)
      await composer(pages.a).press('Enter')
      await composer(pages.a).press('Enter')
      await pages.a.waitForTimeout(1200)
      const count = await serverTextCount(directAB._id, text)
      return count > 1 ? anomaly(`server stored ${count} copies of one draft`) : { note: `stored ${count} copy` }
    })

    await step('double-click the Send button', async () => {
      const text = `double-click-${Date.now()}`
      await composer(pages.a).fill(text)
      await pages.a.getByRole('button', { name: 'Send', exact: true }).dblclick()
      await pages.a.waitForTimeout(1200)
      const count = await serverTextCount(directAB._id, text)
      return count > 1 ? anomaly(`server stored ${count} copies after a double-click`) : { note: `stored ${count} copy` }
    })

    await step('ten Enter presses on one draft', async () => {
      const text = `burst-${Date.now()}`
      await composer(pages.a).fill(text)
      for (let i = 0; i < 10; i += 1) await composer(pages.a).press('Enter')
      await pages.a.waitForTimeout(1500)
      const count = await serverTextCount(directAB._id, text)
      return count > 1 ? anomaly(`server stored ${count} copies from one draft`) : { note: `stored ${count} copy` }
    })

    await step('whitespace-only message is blocked by the client', async () => {
      const before = await bubbles(pages.a).count()
      await composer(pages.a).fill('     ')
      await composer(pages.a).press('Enter')
      await pages.a.waitForTimeout(500)
      const after = await bubbles(pages.a).count()
      return after === before ? { note: 'no bubble added' } : anomaly(`bubble count ${before} -> ${after}`)
    })

    await step('newline-only message is blocked by the client', async () => {
      const before = await bubbles(pages.a).count()
      await composer(pages.a).fill('\n\n\n')
      await composer(pages.a).press('Enter')
      await pages.a.waitForTimeout(500)
      const after = await bubbles(pages.a).count()
      return after === before ? { note: 'no bubble added' } : anomaly(`bubble count ${before} -> ${after}`)
    })

    await step('4001-character message has no client limit', async () => {
      const text = `long-${Date.now()}-` + 'x'.repeat(4001)
      await send(pages.a, text)
      await pages.a.waitForTimeout(1500)
      const count = await serverTextCount(directAB._id, text)
      return count === 1 ? { note: 'accepted (BUG-019: server accepts over-4000 text)' } : anomaly(`stored ${count} copies`)
    })

    await step('100,000-character paste', async () => {
      const text = `huge-${Date.now()}-` + 'y'.repeat(100_000)
      const startedAt = Date.now()
      await composer(pages.a).fill(text)
      await composer(pages.a).press('Enter')
      await pages.a.waitForTimeout(2500)
      const state = await socketState(pages.a)
      const count = await serverTextCount(directAB._id, text)
      const note = `${Date.now() - startedAt} ms, socket=${JSON.stringify(state)}, stored=${count}`
      return state.connected && count <= 1 ? { note } : anomaly(`large paste: ${note}`)
    })

    await step('HTML and script payload renders as text', async () => {
      const text = `<b>bold</b><img src=x onerror="window.__chaos=1">-${Date.now()}`
      await send(pages.a, text)
      await expect(pages.b.locator('[data-message-id]').filter({ hasText: '<b>bold</b>' })).toHaveCount(1, { timeout: 15_000 })
      const injected = await pages.b.evaluate(() => ({ xss: window.__chaos ?? null, bold: document.querySelectorAll('main b').length, img: document.querySelectorAll('main img[src="x"]').length }))
      return !injected.xss && injected.bold === 0 && injected.img === 0 ? { note: 'inert in bob DOM' } : anomaly(`injection ${JSON.stringify(injected)}`)
    })

    // 11-20: emoji, search, new-chat dialogs, profile
    await step('three-emoji and four-emoji sizing', async () => {
      await send(pages.a, '😀😀😀')
      await send(pages.a, '😀😀😀😀')
      await pages.a.waitForTimeout(1200)
      const sizes = await pages.a.evaluate(() => {
        const fontOf = (text) => {
          for (const container of document.querySelectorAll('[data-message-id]')) {
            const node = [...container.querySelectorAll('div')].find(
              (el) => el.children.length === 0 && el.textContent.trim() === text,
            )
            if (node) return parseFloat(getComputedStyle(node).fontSize)
          }
          return null
        }
        return { three: fontOf('😀😀😀'), four: fontOf('😀😀😀😀') }
      })
      return sizes.three && sizes.four && sizes.three > sizes.four
        ? { note: `3 emoji ${sizes.three}px vs 4 emoji ${sizes.four}px` }
        : anomaly(`jumbo sizing ${JSON.stringify(sizes)}`)
    })

    await step('emoji picker inserts at the caret', async () => {
      await composer(pages.a).fill('Hello world')
      await composer(pages.a).evaluate((el) => { el.focus(); el.selectionStart = el.selectionEnd = 5 })
      await pages.a.getByRole('button', { name: '🙂' }).click()
      const search = pages.a.getByRole('textbox', { name: 'Type to search for an emoji' })
      await search.fill('grinning')
      const emoji = pages.a.locator('[aria-label="grinning face"]').first()
      await emoji.waitFor({ state: 'visible', timeout: 30_000 })
      await emoji.click()
      const value = await composer(pages.a).inputValue()
      await composer(pages.a).fill('')
      if (await search.isVisible().catch(() => false)) await pages.a.getByRole('button', { name: '🙂' }).click()
      return value === 'Hello😀 world' ? { note: 'inserted at caret' } : anomaly(`composer value "${value}"`)
    })

    await step('emoji picker after send', async () => {
      await pages.a.getByRole('button', { name: '🙂' }).click()
      const picker = pages.a.getByRole('textbox', { name: 'Type to search for an emoji' })
      await picker.waitFor({ state: 'visible', timeout: 30_000 })
      await composer(pages.a).fill(`picker-open-${Date.now()}`)
      await composer(pages.a).press('Enter')
      await pages.a.waitForTimeout(800)
      const stillOpen = await picker.isVisible().catch(() => false)
      if (stillOpen) await pages.a.getByRole('button', { name: '🙂' }).click()
      return { note: `picker ${stillOpen ? 'stays open' : 'closed'} after send` }
    })

    await step('conversation search filters the list', async () => {
      const before = await rows(pages.a).count()
      await pages.a.getByPlaceholder('Search').fill('zzz-no-match')
      await pages.a.waitForTimeout(600)
      const after = await rows(pages.a).count()
      await pages.a.getByPlaceholder('Search').fill('')
      return after < before ? { note: `${before} -> ${after} rows` } : anomaly(`typing a non-matching query left all ${after} rows visible`)
    })

    await step('New chat with an existing contact does not duplicate the row', async () => {
      const before = await rows(pages.a).count()
      pages.a.once('dialog', (dialog) => dialog.accept(bob.user.username))
      await pages.a.getByRole('button', { name: 'New' }).click()
      await pages.a.waitForTimeout(1200)
      const after = await rows(pages.a).count()
      const convs = await apiGet(request, alice.accessToken, '/conversations')
      return after === before
        ? { note: `still ${after} rows; header ${await header(pages.a).innerText()}` }
        : anomaly(`rows ${before} -> ${after} in the UI, while the API still returns ${convs.body?.conversations?.length} conversations`)
    })

    await step('New chat with an unknown username', async () => {
      const dialogs = []
      const handler = async (dialog) => {
        dialogs.push({ type: dialog.type(), message: dialog.message() })
        await dialog.accept(dialog.type() === 'prompt' ? `nouser_${Date.now()}` : undefined)
      }
      pages.a.on('dialog', handler)
      await pages.a.getByRole('button', { name: 'New' }).click()
      await pages.a.waitForTimeout(1500)
      pages.a.off('dialog', handler)
      return dialogs.length ? { note: `dialogs: ${JSON.stringify(dialogs)}` } : anomaly('no feedback at all for an unknown username')
    })

    await step('New chat cancelled with an empty prompt', async () => {
      const before = await rows(pages.a).count()
      pages.a.once('dialog', (dialog) => dialog.dismiss())
      await pages.a.getByRole('button', { name: 'New' }).click()
      await pages.a.waitForTimeout(600)
      const after = await rows(pages.a).count()
      return after === before ? { note: 'no change' } : anomaly(`rows ${before} -> ${after}`)
    })

    await step('New chat with your own username', async () => {
      const dialogs = []
      pages.a.on('dialog', async (dialog) => {
        dialogs.push(dialog.message())
        await dialog.accept(dialog.type() === 'prompt' ? alice.user.username : undefined)
      })
      await pages.a.getByRole('button', { name: 'New' }).click()
      await pages.a.waitForTimeout(1500)
      pages.a.removeAllListeners('dialog')
      const rowNames = await rows(pages.a).evaluateAll((els) =>
        els.map((el) => {
          const name = el.querySelector('.text-sm')?.textContent?.trim() || ''
          const preview = el.querySelector('.text-xs')?.textContent?.trim() || ''
          return `${name} [${preview.slice(0, 20)}]`
        }),
      )
      const convs = await apiGet(request, alice.accessToken, '/conversations')
      const selfChats = (convs.body?.conversations || []).filter((c) =>
        (c.participants || []).every((p) => String(p.user?._id ?? p.user) === String(alice.user._id)),
      )
      return {
        status: 'anomaly',
        note: `dialogs=${JSON.stringify(dialogs)} header="${await header(pages.a).innerText()}" rows=${rowNames.length} (${JSON.stringify(rowNames)}), api conversations=${convs.body?.conversations?.length}, self chats=${selfChats.length}`,
      }
    })

    await step('profile: 161-character bio', async () => {
      await navigateInApp(pages.a, '/profile')
      await pages.a.getByPlaceholder('Display name').waitFor({ state: 'visible' })
      await pages.a.getByPlaceholder('Bio').fill('z'.repeat(161))
      const [response] = await Promise.all([
        pages.a.waitForResponse((res) => res.url().endsWith('/users/me') && res.request().method() === 'PATCH'),
        pages.a.getByRole('button', { name: 'Save' }).click(),
      ])
      await pages.a.waitForTimeout(400)
      const message = await pages.a.locator('form p').innerText().catch(() => '')
      await navigateInApp(pages.a, '/')
      return response.status() === 500
        ? anomaly(`PATCH /users/me -> ${response.status()} with raw validation text: ${message.slice(0, 120)}`)
        : { note: `${response.status()}: ${message}` }
    })

    await step('profile: one-character username', async () => {
      await navigateInApp(pages.a, '/profile')
      await pages.a.getByPlaceholder('Display name').waitFor({ state: 'visible' })
      const original = await pages.a.getByPlaceholder('Username').inputValue()
      await pages.a.getByPlaceholder('Username').fill('a')
      const [response] = await Promise.all([
        pages.a.waitForResponse((res) => res.url().endsWith('/users/me') && res.request().method() === 'PATCH'),
        pages.a.getByRole('button', { name: 'Save' }).click(),
      ])
      await pages.a.waitForTimeout(400)
      const message = await pages.a.locator('form p').innerText().catch(() => '')
      const accepted = (await pages.a.getByPlaceholder('Username').inputValue()) === 'a'
      if (accepted) {
        await pages.a.getByPlaceholder('Username').fill(original)
        await pages.a.getByRole('button', { name: 'Save' }).click()
      }
      await navigateInApp(pages.a, '/')
      return accepted ? anomaly(`one-character username accepted (${response.status()}); message "${message}"`) : { note: `rejected: ${message}` }
    })

    // 21-30: group interleave, receipts of state, rapid switching
    await step('group: three users send at the same time', async () => {
      await openChat(pages.a, 'Chaos Group')
      await openChat(pages.b, 'Chaos Group')
      await openChat(pages.c, 'Chaos Group')
      const tag = Date.now()
      await Promise.all([
        send(pages.a, `group-a-${tag}`),
        send(pages.b, `group-b-${tag}`),
        send(pages.c, `group-c-${tag}`),
      ])
      await pages.a.waitForTimeout(2000)
      const seen = {}
      for (const [label, page] of Object.entries(pages)) {
        seen[label] = await Promise.all([`group-a-${tag}`, `group-b-${tag}`, `group-c-${tag}`].map(async (text) => (await page.locator('[data-message-id]').filter({ hasText: text }).count()) > 0))
      }
      const ok = Object.values(seen).every((flags) => flags.every(Boolean))
      return ok ? { note: `all three messages visible to all three users` } : anomaly(`group delivery ${JSON.stringify(seen)}`)
    })

    await step('three-user interleave does not cross conversations', async () => {
      await openChat(pages.a, 'Chaos AB')
      await openChat(pages.b, 'Chaos AB')
      await openChat(pages.c, 'Chaos AC')
      const tag = Date.now()
      const directText = `interleave-ab-${tag}`
      const groupText = `interleave-group-${tag}`
      acMarker = `interleave-ac-${tag}`
      await Promise.all([
        send(pages.b, directText),
        (async () => { await openChat(pages.a, 'Chaos Group').catch(() => {}); await send(pages.a, groupText) })(),
        send(pages.c, acMarker),
      ])
      await pages.b.waitForTimeout(1800)
      const bobDirect = await pages.b.locator('[data-message-id]').filter({ hasText: directText }).count()
      const bobGroupLeak = await pages.b.locator('[data-message-id]').filter({ hasText: groupText }).count()
      await openChat(pages.a, 'Chaos AB')
      const aliceDirect = await pages.a.locator('[data-message-id]').filter({ hasText: directText }).count()
      return bobDirect >= 1 && bobGroupLeak === 0 && aliceDirect >= 1
        ? { note: 'direct and group messages stayed in their own chats' }
        : anomaly(`bobDirect=${bobDirect} groupLeak=${bobGroupLeak} aliceDirect=${aliceDirect}`)
    })

    await step('stale history after a slow conversation switch', async () => {
      await openChat(pages.a, 'Chaos AB')
      const before = await bubbles(pages.a).count()
      await pages.a.route(`**/conversations/${directAC._id}/messages*`, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 900))
        await route.continue()
      })
      await row(pages.a, 'Chaos AC').first().click()
      await pages.a.waitForTimeout(100)
      await row(pages.a, 'Chaos AB').first().click()
      await pages.a.waitForTimeout(2500)
      await pages.a.unroute(`**/conversations/${directAC._id}/messages*`)
      const after = await bubbles(pages.a).count()
      const title = await header(pages.a).innerText()
      const leaked = acMarker ? await pages.a.locator('[data-message-id]').filter({ hasText: acMarker }).count() : 0
      return title === 'Chaos AB' && leaked === 0
        ? { note: `header=${title}, bubbles ${before} -> ${after}, no AC content` }
        : anomaly(`stale history: header=${title}, bubbles ${before} -> ${after}, AC messages on screen=${leaked}`)
    })

    await step('rapid conversation switching (30 clicks)', async () => {
      const names = ['Chaos AB', 'Chaos AC', 'Chaos Group']
      const startedAt = Date.now()
      for (let i = 0; i < 30; i += 1) await row(pages.a, names[i % names.length]).first().click({ timeout: 5000 }).catch(() => {})
      await pages.a.waitForTimeout(1500)
      return { note: `30 clicks in ${Date.now() - startedAt} ms, header ${await header(pages.a).innerText()}` }
    })

    await step('draft survives switching away and back', async () => {
      await openChat(pages.a, 'Chaos AB')
      await composer(pages.a).fill('draft-keep-me')
      await openChat(pages.a, 'Chaos AC')
      await openChat(pages.a, 'Chaos AB')
      const value = await composer(pages.a).inputValue()
      await composer(pages.a).fill('')
      return value === 'draft-keep-me' ? { note: 'draft restored' } : anomaly(`draft was "${value}"`)
    })

    await step('info panel toggles 20 times quickly', async () => {
      for (let i = 0; i < 20; i += 1) await pages.a.getByRole('button', { name: 'Chat info' }).click({ timeout: 5000 })
      const pressed = await pages.a.getByRole('button', { name: 'Chat info' }).getAttribute('aria-pressed')
      return { note: `aria-pressed=${pressed}` }
    })

    await step('media tabs switch 12 times', async () => {
      const tabs = ['Photos', 'Files', 'Audio']
      for (let i = 0; i < 12; i += 1) await pages.a.getByRole('tab', { name: tabs[i % 3] }).click({ timeout: 5000 })
      const selected = await pages.a.getByRole('tab', { selected: true }).innerText()
      return { note: `selected tab ${selected}` }
    })

    await step('send 30 messages quickly and check order', async () => {
      await openChat(pages.a, 'Chaos AB')
      await openChat(pages.b, 'Chaos AB')
      await pages.a.evaluate(() => {
        window.__wsIds = {}
        window.addEventListener('ws-message', (event) => {
          const id = event.detail?.message?._id
          if (id) window.__wsIds[id] = (window.__wsIds[id] || 0) + 1
        })
      })
      const tag = Date.now()
      const texts = Array.from({ length: 30 }, (_, i) => `rapid-${tag}-${String(i).padStart(2, '0')}`)
      for (const text of texts) await send(pages.a, text)
      await pages.b.waitForTimeout(3000)
      const rendered = await pages.b.evaluate(() =>
        [...document.querySelectorAll('[data-message-id]')].map((el) => el.textContent),
      )
      const positions = texts.map((text) => rendered.findIndex((content) => content.includes(text)))
      const missing = texts.filter((_, i) => positions[i] === -1).length
      const ordered = positions.every((position, i) => i === 0 || (position > positions[i - 1] && position !== -1))
      const ws = await pages.a.evaluate(() => {
        const counts = Object.values(window.__wsIds || {})
        return { ids: counts.length, duplicated: counts.filter((count) => count > 1).length, max: Math.max(0, ...counts) }
      })
      const dom = await pages.a.evaluate(() => {
        const ids = [...document.querySelectorAll('[data-message-id]')].map((el) => el.getAttribute('data-message-id'))
        return { bubbles: ids.length, unique: new Set(ids).size, duplicated: ids.length - new Set(ids).size }
      })
      const note = `bob ${missing === 0 && ordered ? 'got all 30 in order' : `missing ${missing}, in-order=${ordered}`}; alice ws events ${JSON.stringify(ws)}, dom ${JSON.stringify(dom)}`
      return missing === 0 && ordered && dom.duplicated === 0 && ws.duplicated === 0
        ? { note }
        : anomaly(note)
    })

    await step('zero-width and control-looking characters', async () => {
      const text = `zw\u200b\u200d\u202e${Date.now()}`
      await send(pages.a, text)
      await pages.b.waitForTimeout(1000)
      const count = await pages.b.locator('[data-message-id]').filter({ hasText: 'zw' }).count()
      return count >= 1 ? { note: 'rendered' } : anomaly('zero-width message vanished')
    })

    // 31-40: uploads, drops, recording, lightbox
    await step('paste an image, send it, and confirm delivery', async () => {
      await openChat(pages.a, 'Chaos AB')
      await openChat(pages.b, 'Chaos AB')
      await pasteFiles(pages.a, [{ name: 'pasted.png', type: 'image/png', base64: pngBase64 }])
      const chip = pages.a.getByRole('button', { name: /(Remove|Cancel upload for) pasted\.png/ })
      await chip.waitFor({ state: 'visible', timeout: 15_000 })
      const ready = pages.a.getByRole('button', { name: 'Remove pasted.png' })
      await ready.waitFor({ state: 'visible', timeout: 15_000 })
      await composer(pages.a).press('Enter')
      const image = pages.b.locator('[data-message-id]:has(img)').first()
      const delivered = await image.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false)
      const media = await apiGet(request, alice.accessToken, `/conversations/${directAB._id}/media?type=image`)
      const note = `delivered=${delivered}, media API ${media.status} items=${media.body?.media?.length}`
      return delivered && (media.body?.media?.length || 0) >= 1
        ? { note }
        : anomaly(`pasted image ${note}`)
    })

    await step('drop a file on the composer', async () => {
      await dropTemplate(pages.a)
      const chip = pages.a.getByRole('button', { name: /(Remove|Cancel upload for) dropped\.png/ })
      const appeared = await chip.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)
      if (appeared) await chip.click()
      return appeared ? { note: 'drop created a chip' } : anomaly('dropping a PNG on the composer did nothing')
    })

    await step('send while an upload is still in progress', async () => {
      await openChat(pages.a, 'Chaos AB')
      await pages.a.route('**/api/uploads', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1500))
        await route.continue()
      })
      await pages.a.locator('input[type=file][accept*="image"]').setInputFiles({ name: 'slow.png', mimeType: 'image/png', buffer: Buffer.from(pngBase64, 'base64') })
      await pages.a.getByRole('progressbar').first().waitFor({ state: 'visible', timeout: 5000 })
      const text = `during-upload-${Date.now()}`
      await composer(pages.a).fill(text)
      await composer(pages.a).press('Enter')
      const toastShown = await pages.a.getByText('Wait for uploads to finish').first().waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)
      await pages.a.waitForTimeout(2000)
      const sent = await serverTextCount(directAB._id, text)
      await pages.a.unroute('**/api/uploads')
      await composer(pages.a).fill('')
      await clearAttachments(pages.a)
      return toastShown && sent === 0 ? { note: 'blocked with a toast, nothing sent' } : anomaly(`toast=${toastShown}, stored=${sent}`)
    })

    await step('cancel an in-flight upload', async () => {
      await pages.a.route('**/api/uploads', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        await route.continue().catch(() => {})
      })
      const input = pages.a.locator('input[type=file][accept*="image"]')
      await input.setInputFiles({ name: 'cancel.png', mimeType: 'image/png', buffer: Buffer.from(pngBase64, 'base64') })
      const cancel = pages.a.getByRole('button', { name: 'Cancel upload for cancel.png' })
      await cancel.waitFor({ state: 'visible', timeout: 5000 })
      await cancel.click()
      await pages.a.waitForTimeout(500)
      const gone = (await pages.a.getByRole('button', { name: /cancel\.png/ }).count()) === 0
      await pages.a.unroute('**/api/uploads')
      return gone ? { note: 'chip removed' } : anomaly('chip survived cancel')
    })

    await step('upload a rejected executable', async () => {
      await pages.a.locator('input[type=file]').nth(1).setInputFiles({ name: 'executable.exe', mimeType: 'application/octet-stream', buffer: exeBuffer })
      await pages.a.waitForTimeout(2500)
      const chip = pages.a.getByRole('button', { name: /executable\.exe/ })
      const label = await pages.a.locator('div:has-text("executable.exe")').last().innerText().catch(() => '')
      if (await chip.count()) await chip.click()
      return { note: `chip text: ${JSON.stringify(label.slice(0, 160))}` }
    })

    await step('upload an oversized file', async () => {
      const before = await pages.a.locator('[role="progressbar"]').count()
      const big = Buffer.alloc(26 * 1024 * 1024, 1)
      await pages.a.locator('input[type=file]').nth(1).setInputFiles({ name: 'too-big.bin', mimeType: 'application/octet-stream', buffer: big })
      await pages.a.waitForTimeout(800)
      const toast = await pages.a.getByText(/too large/).isVisible().catch(() => false)
      const chips = (await pages.a.getByRole('button', { name: /too-big\.bin/ }).count()) > 0
      return !chips ? { note: `rejected client-side, toast=${toast}` } : anomaly('a 26 MB file entered the composer')
    })

    await step('voice recording start, stop, and send', async () => {
      await pages.a.getByRole('button', { name: 'Record voice message' }).click()
      await pages.a.getByRole('timer').waitFor({ state: 'visible', timeout: 5000 })
      await pages.a.waitForTimeout(1500)
      await pages.a.getByRole('button', { name: 'Send', exact: true }).click()
      const audio = pages.b.locator('[data-message-id]').filter({ has: pages.b.locator('audio, [aria-label="Play"]') })
      const appeared = await audio.first().waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false)
      return appeared ? { note: 'voice message delivered to bob' } : anomaly('voice message did not arrive')
    })

    await step('voice recording cancelled', async () => {
      await pages.a.getByRole('button', { name: 'Record voice message' }).click()
      await pages.a.getByRole('timer').waitFor({ state: 'visible', timeout: 5000 })
      await pages.a.waitForTimeout(1200)
      await pages.a.getByRole('button', { name: 'Cancel', exact: true }).click()
      await pages.a.waitForTimeout(1200)
      const timerGone = (await pages.a.getByRole('timer').count()) === 0
      return timerGone ? { note: 'recording bar closed, nothing sent' } : anomaly('recording bar stayed open')
    })

    await step('lightbox opens and navigates from the Photos tab', async () => {
      await pages.a.getByRole('tab', { name: 'Photos' }).click()
      const panel = pages.a.locator('aside').nth(1)
      const tile = panel.locator('button:has(img)').first()
      const hasTile = await tile.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)
      if (!hasTile) {
        const counts = {
          imgs: await panel.locator('img').count(),
          tiles: await panel.locator('button:has(img)').count(),
          tab: await panel.getByRole('tab', { selected: true }).innerText().catch(() => ''),
          text: (await panel.innerText().catch(() => '')).slice(0, 120),
        }
        return anomaly(`no photo tile: ${JSON.stringify(counts)}`)
      }
      await tile.click()
      const viewer = pages.a.getByRole('dialog', { name: 'Image viewer' })
      const opened = await viewer.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)
      if (!opened) return anomaly('the photo tile click did not open the lightbox')
      await pages.a.keyboard.press('ArrowRight')
      await pages.a.keyboard.press('Escape')
      const closedByEsc = await viewer.waitFor({ state: 'hidden', timeout: 3000 }).then(() => true).catch(() => false)
      if (!closedByEsc) await pages.a.getByRole('button', { name: 'Close image viewer' }).click({ timeout: 5000 }).catch(() => {})
      const stillOpen = await viewer.isVisible().catch(() => false)
      return closedByEsc && !stillOpen
        ? { note: 'opened, arrow navigated, Esc closed' }
        : anomaly(`lightbox: Esc closed=${closedByEsc}, still open after the close button=${stillOpen}`)
    })

    await step('close a tab in the middle of an upload', async () => {
      const throwaway = await openUserContext(browser, alice.user)
      await openChat(throwaway.page, 'Chaos AB')
      await throwaway.page.route('**/api/uploads', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 4000))
        await route.continue().catch(() => {})
      })
      await throwaway.page.locator('input[type=file][accept*="image"]').setInputFiles({ name: 'doomed.png', mimeType: 'image/png', buffer: Buffer.from(pngBase64, 'base64') })
      await throwaway.page.getByRole('progressbar').first().waitFor({ state: 'visible', timeout: 5000 })
      await throwaway.context.close()
      await pages.a.waitForTimeout(1000)
      const status = await health(request)
      return status === 200 ? { note: `server healthy (${status}) after the tab closed` } : anomaly(`health ${status}`)
    })

    await step('switch account in one browser', async () => {
      const throwaway = await openUserContext(browser, alice.user)
      await throwaway.page.goto(`${APP_URL}/login`)
      await throwaway.page.getByPlaceholder('Email or username').fill(bob.user.username)
      await throwaway.page.getByPlaceholder('Password').fill(bob.user.password)
      await throwaway.page.getByRole('button', { name: 'Sign in' }).click()
      await throwaway.page.waitForURL(`${APP_URL}/`)
      await waitForSocket(throwaway.page)
      const names = await rows(throwaway.page).allInnerTexts()
      await throwaway.context.close()
      return names.some((text) => text.includes('Chaos AB')) ? { note: `bob sees ${names.length} rows after login on the same tab` } : anomaly(`rows after switch: ${JSON.stringify(names)}`)
    })

    // 41-50: network, viewport, scroll, accessibility, notifications
    await step('offline send leaves a pending bubble and shows the banner', async () => {
      await openChat(pages.a, 'Chaos AB')
      await a.context.setOffline(true)
      await pages.a.evaluate(() => window.__socket?.io?.engine?.close?.())
      const banner = pages.a.getByText(/Reconnecting/i).first()
      const seen = await banner.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false)
      const text = `offline-${Date.now()}`
      await send(pages.a, text)
      await pages.a.waitForTimeout(800)
      const pending = await pages.a.locator('[data-message-id]').filter({ hasText: text }).count()
      await a.context.setOffline(false)
      const cleared = await banner.waitFor({ state: 'hidden', timeout: 20_000 }).then(() => true).catch(() => false)
      await waitForSocket(pages.a)
      const retried = await serverTextCount(directAB._id, text)
      return seen && cleared
        ? { note: `banner shown/cleared; offline bubble count ${pending}, server copies after reconnect ${retried} (BUG-034/BUG-091 tracking)` }
        : anomaly(`banner shown=${seen} cleared=${cleared}`)
    })

    await step('3 offline flaps while typing preserve the draft', async () => {
      await openChat(pages.a, 'Chaos AB')
      await composer(pages.a).fill('flap-draft')
      for (let i = 0; i < 3; i += 1) {
        await a.context.setOffline(true)
        await pages.a.waitForTimeout(200)
        await a.context.setOffline(false)
        await pages.a.waitForTimeout(300)
      }
      const value = await composer(pages.a).inputValue()
      await composer(pages.a).fill('')
      return value === 'flap-draft' ? { note: 'draft intact' } : anomaly(`draft "${value}"`)
    })

    await step('viewport rotation mid-conversation', async () => {
      await openChat(pages.a, 'Chaos Group')
      const sizes = [[390, 844], [768, 1024], [1440, 900], [360, 760]]
      const overflows = []
      for (const [width, height] of sizes) {
        await pages.a.setViewportSize({ width, height })
        await pages.a.waitForTimeout(300)
        const overflow = await pages.a.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        overflows.push({ width, overflow })
      }
      const bad = overflows.filter((entry) => entry.overflow > 0)
      return bad.length ? { status: 'ok', note: `horizontal overflow: ${JSON.stringify(bad)} (BUG-067)` } : { note: 'no horizontal overflow at four sizes' }
    })

    await step('200% zoom', async () => {
      await openChat(pages.a, 'Chaos Group')
      await pages.a.setViewportSize({ width: 720, height: 450 })
      await pages.a.waitForTimeout(400)
      const usable = await pages.a.evaluate(() => {
        const textarea = document.querySelector('textarea')
        const box = textarea?.getBoundingClientRect()
        return { width: Math.round(box?.width || 0), overflow: document.documentElement.scrollWidth - window.innerWidth }
      })
      await pages.a.setViewportSize({ width: 1440, height: 900 })
      return usable.width > 80 ? { note: `composer ${usable.width}px wide, overflow ${usable.overflow}px` } : anomaly(`composer collapsed to ${usable.width}px`)
    })

    await step('long unbroken word does not overflow the page', async () => {
      await openChat(pages.a, 'Chaos AB')
      await send(pages.a, 'W'.repeat(4000))
      await pages.a.waitForTimeout(1200)
      const overflow = await pages.a.evaluate(() => ({ body: document.documentElement.scrollWidth - window.innerWidth, main: (() => { const el = document.querySelector('main .overflow-auto'); return el ? el.scrollWidth - el.clientWidth : null })() }))
      return overflow.body <= 0 ? { note: `document overflow ${overflow.body}px, message pane overflow ${overflow.main}px` } : anomaly(`document overflows by ${overflow.body}px`)
    })

    await step('scroll up while messages arrive', async () => {
      await openChat(pages.a, 'Chaos AB')
      const pane = pages.a.locator('main .overflow-auto')
      await pane.evaluate((el) => { el.scrollTop = 0 })
      const tag = Date.now()
      for (let i = 0; i < 5; i += 1) await send(pages.b, `while-scrolled-${tag}-${i}`)
      await pages.a.waitForTimeout(1800)
      const pill = await pages.a.getByText(/New messages/i).count()
      const scrollTop = await pane.evaluate((el) => Math.round(el.scrollTop))
      return { note: `scrollTop=${scrollTop}px, new-message pill count=${pill} (BUG-076 if absent)` }
    })

    await step('browser back and forward', async () => {
      await pages.a.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {})
      await pages.a.waitForTimeout(500)
      const afterBack = pages.a.url()
      if (!afterBack.startsWith(APP_URL)) return { note: `back left the app: ${afterBack}` }
      await pages.a.goForward({ waitUntil: 'domcontentloaded' }).catch(() => {})
      await pages.a.waitForTimeout(500)
      return { note: `back/forward stayed inside ${APP_URL}` }
    })

    await step('reload keeps the session', async () => {
      await pages.a.setViewportSize({ width: 1440, height: 900 })
      await pages.a.reload()
      const loginVisible = await pages.a.getByPlaceholder('Email or username').isVisible().catch(() => false)
      return { note: loginVisible ? 'reload logged the user out (BUG-039), session ends keyboard check' : 'reload kept the session' }
    })

    await step('console, page errors, and failed requests', async () => {
      const byKind = events.reduce((acc, entry) => {
        acc[entry.kind] = (acc[entry.kind] || 0) + 1
        return acc
      }, {})
      return Object.keys(byKind).length ? { status: 'ok', note: JSON.stringify(byKind) } : { note: 'none' }
    })
  } finally {
    const timed = events.map((entry) => ({
      t: Number(((entry.at - sessionStartedAt) / 1000).toFixed(1)),
      label: entry.label,
      kind: entry.kind,
      text: entry.text,
    }))
    const summary = {
      startedAt: new Date(sessionStartedAt).toISOString(),
      run: RUN,
      steps,
      anomalies: steps.filter((entry) => entry.status === 'anomaly'),
      errors: steps.filter((entry) => entry.status === 'error'),
      events: timed,
      counts: {
        steps: steps.length,
        anomaly: steps.filter((entry) => entry.status === 'anomaly').length,
        error: steps.filter((entry) => entry.status === 'error').length,
      },
    }
    writeFileSync(`${EVIDENCE_DIR}phase13-session-${RUN}.json`, JSON.stringify(summary, null, 2))
    const lines = [
      `# Phase 13 chaos session — ${RUN}`,
      '',
      `Steps: ${summary.counts.steps} | anomalies: ${summary.counts.anomaly} | errors: ${summary.counts.error}`,
      '',
      ...steps.map((entry) => `${String(entry.id).padStart(2, '0')}. **${entry.name}** — ${entry.status}${entry.note ? `: ${entry.note}` : ''}`),
      '',
      '## Browser events',
      ...timed.map((entry) => `- +${entry.t}s [${entry.label}] ${entry.kind}: ${entry.text}`),
    ]
    writeFileSync(`${EVIDENCE_DIR}phase13-session-${RUN}.md`, lines.join('\n'))
    console.log(`[chaos] summary ${JSON.stringify(summary.counts)}`)
    console.log(`[chaos] anomalies ${JSON.stringify(summary.anomalies.map((entry) => ({ id: entry.id, name: entry.name, note: entry.note })))}`)
    await a.context.close()
    await b.context.close()
    await c.context.close()
  }
})
