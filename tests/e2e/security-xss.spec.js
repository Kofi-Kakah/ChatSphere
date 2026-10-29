import { crc32 } from 'node:zlib'
import { expect, test } from '@playwright/test'
import {
  authHeaders,
  closePair,
  createDirectPair,
  createGroupViaApi,
  expectMessageVisible,
  messageBubbles,
  openConversationNamed,
  openFirstConversation,
  openUserContext,
  registerUser,
  sendMessageThroughUi,
  waitForSocket,
} from '../helpers/flows.js'
import { API_URL } from '../helpers/users.js'

const XSS = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>'
const XSS_NAME = '<img src=x onerror=window.__xss=1>'
const FILE_XSS = '<img src=x onerror=window.__xss=1>.zip'

function makeZip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const { name, data } of entries) {
    const nameBuffer = Buffer.from(name)
    const body = Buffer.from(data)
    const crc = crc32(body)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(body.length, 22)
    local.writeUInt16LE(nameBuffer.length, 26)
    locals.push(local, nameBuffer, body)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(body.length, 24)
    central.writeUInt16LE(nameBuffer.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBuffer)
    offset += 30 + nameBuffer.length + body.length
  }
  const centralBuffer = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBuffer, end])
}

const INJECTED = 'img, script, [onerror], [onload]'

async function expectInert(page, scope) {
  expect(await page.locator(scope).locator(INJECTED).count()).toBe(0)
  expect(await page.evaluate(() => window.__xss)).toBeUndefined()
}

async function sendFileViaSocket(page, conversationId, uploadId) {
  await waitForSocket(page)
  return page.evaluate(
    async ({ conversationId: convId, uploadId: id }) => {
      return new Promise((resolve) => {
        window.__socket.emit(
          'message:send',
          { conversationId: convId, clientId: crypto.randomUUID(), type: 'file', uploadIds: [id] },
          resolve,
        )
      })
    },
    { conversationId, uploadId },
  )
}

test.describe('E2E stored XSS rendering (Testing.md 6.1)', () => {
  test('display name, username, and bio payloads are inert in the owner profile', async ({ browser, request }) => {
    const alice = await registerUser(request, 'xssp', XSS_NAME)
    const usernamePayload = `x<img1>y${Date.now() % 100}`
    const updated = await request.patch(`${API_URL}/users/me`, {
      headers: authHeaders(alice.accessToken),
      data: { username: usernamePayload, bio: XSS },
    })
    expect(updated.ok()).toBeTruthy()

    const session = await openUserContext(browser, { ...alice.user, username: usernamePayload })
    try {
      await session.page.evaluate(() => {
        window.history.pushState({}, '', '/profile')
        window.dispatchEvent(new PopStateEvent('popstate'))
      })
      await expect(session.page.getByPlaceholder('Display name')).toBeVisible()

      expect(await session.page.getByPlaceholder('Display name').inputValue()).toBe(XSS_NAME)
      expect(await session.page.getByPlaceholder('Username').inputValue()).toBe(usernamePayload)
      expect(await session.page.getByPlaceholder('Bio').inputValue()).toBe(XSS)
      await expectInert(session.page, 'form')
    } finally {
      await session.context.close()
    }
  })

  test('a group name payload is inert in both members DOMs', async ({ browser, request }) => {
    const alice = await registerUser(request, 'xssga', XSS_NAME)
    const bob = await registerUser(request, 'xssgb', 'Bob XSS Group')
    const carol = await registerUser(request, 'xssgc', 'Carol XSS Group')
    await createGroupViaApi(request, alice, [bob.user._id, carol.user._id], XSS)

    const a = await openUserContext(browser, alice.user)
    let b
    try {
      b = await openUserContext(browser, bob.user)
      for (const page of [a.page, b.page]) {
        await expect(page.locator('aside').getByText(XSS, { exact: true })).toBeVisible()
        await openConversationNamed(page, XSS)
        await expectInert(page, 'aside, main')
      }
    } finally {
      await a.context.close()
      await b?.context.close()
    }
  })

  test('a sender display-name payload is inert in the receiver DOM [BUG-048]', async ({ browser, request }) => {
    test.fail(true, 'BUG-048: group bubbles never render sender names, so the receiver never displays the payload')
    const alice = await registerUser(request, 'xssgs', XSS_NAME)
    const bob = await registerUser(request, 'xssgr', 'Bob XSS Sender')
    const carol = await registerUser(request, 'xssgt', 'Carol XSS Sender')
    await createGroupViaApi(request, alice, [bob.user._id, carol.user._id], 'Sender payload group')

    const a = await openUserContext(browser, alice.user)
    let b
    try {
      b = await openUserContext(browser, bob.user)
      await openConversationNamed(a.page, 'Sender payload group')
      await openConversationNamed(b.page, 'Sender payload group')

      const text = `group sender payload ${Date.now()}`
      await sendMessageThroughUi(a.page, text)
      await expectMessageVisible(b.page, text)

      const senderLabel = b.page.locator('[data-sender-name]').filter({ hasText: XSS_NAME }).first()
      await expect(senderLabel).toBeVisible()
      expect(await senderLabel.innerText()).toBe(XSS_NAME)
      await expectInert(b.page, 'aside, main')
      await expectInert(a.page, 'aside, main')
    } finally {
      await a.context.close()
      await b?.context.close()
    }
  })

  test('message and file-name payloads are inert in the sender and receiver DOMs', async ({ browser, request }) => {
    const pair = await createDirectPair(browser, request, {
      prefixA: 'xssfa',
      nameA: 'Alice XSS File',
      prefixB: 'xssfb',
      nameB: 'Bob XSS File',
    })
    try {
      await openFirstConversation(pair.a.page)
      await openFirstConversation(pair.b.page)

      const text = `message payload ${Date.now()} ${XSS}`
      await sendMessageThroughUi(pair.a.page, text)
      await expectMessageVisible(pair.b.page, text)
      await expectMessageVisible(pair.a.page, text)
      for (const page of [pair.a.page, pair.b.page]) {
        const row = messageBubbles(page, 'img src=x').first()
        expect(await row.innerText()).toContain(XSS)
        await expectInert(page, 'aside, main')
      }

      const uploaded = await request.post(`${API_URL}/uploads`, {
        headers: authHeaders(pair.alice.accessToken),
        multipart: {
          file: {
            name: FILE_XSS,
            mimeType: 'application/zip',
            buffer: makeZip([{ name: 'payload.txt', data: 'x' }]),
          },
        },
      })
      expect(uploaded.ok()).toBeTruthy()
      const { uploadId } = await uploaded.json()

      const ack = await sendFileViaSocket(pair.a.page, pair.conversation._id, uploadId)
      expect(ack?.ok).toBe(true)

      for (const page of [pair.a.page, pair.b.page]) {
        const row = messageBubbles(page, 'img src=x').filter({ hasText: '.zip' }).first()
        await expect(row).toBeVisible()
        expect(await row.innerText()).toContain(FILE_XSS)
        await expectInert(page, 'aside, main')
      }
    } finally {
      await closePair(pair)
    }
  })
})
