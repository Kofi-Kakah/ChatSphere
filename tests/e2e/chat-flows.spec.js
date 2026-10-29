import { expect, test } from '@playwright/test'
import {
  authHeaders,
  closePair,
  createDirectPair,
  createDirectViaApi,
  expectMessageVisible,
  fixBrowserDate,
  messageBubbles,
  messageRow,
  normalizeSpace,
  openEmojiPicker,
  openFirstConversation,
  openUserContext,
  registerUser,
  seedMessagesThroughSocket,
  sendMessageThroughUi,
  startChatThroughUi,
  trackEmojiPickerRequests,
} from '../helpers/flows.js'
import { API_URL } from '../helpers/users.js'

test.describe('E2E one-to-one chat, timestamps, receipts, presence, typing, emoji (5.4-5.7, 5.9)', () => {
  test('delivers a message to the other user in real time and stores it once', async ({ browser, request }) => {
    const pair = await createDirectPair(browser, request, {
      prefixA: 'rta',
      nameA: 'Alice Realtime',
      prefixB: 'rtb',
      nameB: 'Bob Realtime',
    })
    try {
      await openFirstConversation(pair.a.page)
      await openFirstConversation(pair.b.page)

      const text = 'realtime hello'
      await sendMessageThroughUi(pair.a.page, text)

      await expectMessageVisible(pair.b.page, text)
      await expectMessageVisible(pair.a.page, text)

      const history = await request.get(
        `${API_URL}/conversations/${pair.conversation._id}/messages?limit=100`,
        { headers: authHeaders(pair.alice.accessToken) },
      )
      expect(history.ok()).toBeTruthy()
      const { messages } = await history.json()
      expect(messages.filter((message) => message.text === text)).toHaveLength(1)
    } finally {
      await closePair(pair)
    }
  })

  test('renders HTML and script payloads as plain text', async ({ browser, request }) => {
    const pair = await createDirectPair(browser, request, {
      prefixA: 'xssa',
      nameA: 'Alice XSS',
      prefixB: 'xssb',
      nameB: 'Bob XSS',
    })
    try {
      await openFirstConversation(pair.a.page)
      await openFirstConversation(pair.b.page)

      const payload = '<img src=x onerror="window.__xss=true"> <script>window.__xss=true</script> <b>bold</b>'
      await sendMessageThroughUi(pair.a.page, payload)
      await expectMessageVisible(pair.b.page, 'img src=x')
      await expectMessageVisible(pair.a.page, 'img src=x')

      for (const page of [pair.a.page, pair.b.page]) {
        const row = messageBubbles(page, 'img src=x').first()
        expect(await row.innerText()).toContain(payload)
        expect(await row.locator('img, script, b').count()).toBe(0)
        expect(await page.evaluate(() => window.__xss)).toBeUndefined()
      }
    } finally {
      await closePair(pair)
    }
  })

  test('preserves Unicode, emoji, and RTL text end to end', async ({ browser, request }) => {
    const pair = await createDirectPair(browser, request, {
      prefixA: 'unia',
      nameA: 'Alice Unicode',
      prefixB: 'unib',
      nameB: 'Bob Unicode',
    })
    try {
      await openFirstConversation(pair.a.page)
      await openFirstConversation(pair.b.page)

      const text = 'Café 世界 👋🏽 مرحبا 🎉'
      await sendMessageThroughUi(pair.a.page, text)
      await expectMessageVisible(pair.b.page, text)
      expect(await messageRow(pair.b.page, text).innerText()).toContain(text)

      const history = await request.get(
        `${API_URL}/conversations/${pair.conversation._id}/messages?limit=10`,
        { headers: authHeaders(pair.alice.accessToken) },
      )
      const { messages } = await history.json()
      expect(messages.at(-1).text).toBe(text)
    } finally {
      await closePair(pair)
    }
  })

  test('shows each message time, the full date on hover, and a Today separator', async ({ browser, request }) => {
    const pair = await createDirectPair(browser, request, {
      prefixA: 'tima',
      nameA: 'Alice Time',
      prefixB: 'timb',
      nameB: 'Bob Time',
    })
    try {
      await openFirstConversation(pair.a.page)
      await openFirstConversation(pair.b.page)

      const text = 'timestamp check'
      await sendMessageThroughUi(pair.a.page, text)
      await expectMessageVisible(pair.b.page, text)

      for (const page of [pair.a.page, pair.b.page]) {
        const row = messageRow(page, text)
        const time = row.locator('time')
        await expect(time).toBeVisible()
        expect(normalizeSpace(await time.innerText())).toMatch(/^\d{1,2}:\d{2}(\s?[AP]M)?$/i)
        expect(await row.getAttribute('title')).toContain(String(new Date().getFullYear()))
        await expect(page.getByRole('separator', { name: 'Today' })).toBeVisible()
      }
    } finally {
      await closePair(pair)
    }
  })

  test('renders timestamps in each viewer local timezone', async ({ browser, request }) => {
    const pair = await createDirectPair(browser, request, {
      prefixA: 'tzna',
      nameA: 'Alice New York',
      prefixB: 'tznb',
      nameB: 'Bob Tokyo',
      contextOptionsA: { timezoneId: 'America/New_York', locale: 'en-US' },
      contextOptionsB: { timezoneId: 'Asia/Tokyo', locale: 'en-US' },
    })
    try {
      await openFirstConversation(pair.a.page)
      await openFirstConversation(pair.b.page)

      const text = 'timezone check'
      await sendMessageThroughUi(pair.a.page, text)
      await expectMessageVisible(pair.b.page, text)

      const iso = await messageRow(pair.a.page, text).locator('time').getAttribute('datetime')
      const expectedNewYork = normalizeSpace(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(iso)),
      )
      const expectedTokyo = normalizeSpace(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Tokyo',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(iso)),
      )

      expect(normalizeSpace(await messageRow(pair.a.page, text).locator('time').innerText())).toBe(expectedNewYork)
      expect(normalizeSpace(await messageRow(pair.b.page, text).locator('time').innerText())).toBe(expectedTokyo)
    } finally {
      await closePair(pair)
    }
  })

  test('labels a previous-day message Yesterday for a viewer whose clock has moved to tomorrow', async ({ browser, request }) => {
    const pair = await createDirectPair(browser, request, {
      prefixA: 'daya',
      nameA: 'Alice Day',
      prefixB: 'dayb',
      nameB: 'Bob Day',
    })
    try {
      await openFirstConversation(pair.a.page)
      await openFirstConversation(pair.b.page)

      await fixBrowserDate(pair.b.page, new Date(Date.now() + 86_400_000))
      const text = 'yesterday check'
      await sendMessageThroughUi(pair.a.page, text)
      await expectMessageVisible(pair.b.page, text)

      await expect(pair.b.page.getByRole('separator', { name: 'Yesterday' })).toBeVisible()
      await expect(pair.a.page.getByRole('separator', { name: 'Today' })).toBeVisible()
      const texts = await pair.b.page.locator('[data-message-id]').allInnerTexts()
      expect(texts.at(-1)).toContain(text)
    } finally {
      await closePair(pair)
    }
  })

  test('shows exactly one bubble after the server acknowledges an optimistic send [BUG-034]', async ({ browser, request }) => {
    test.fail(true, 'BUG-034: the optimistic bubble is never reconciled with the server copy')
    const pair = await createDirectPair(browser, request, {
      prefixA: 'opta',
      nameA: 'Alice Optimistic',
      prefixB: 'optb',
      nameB: 'Bob Optimistic',
    })
    try {
      await openFirstConversation(pair.a.page)
      await openFirstConversation(pair.b.page)

      const text = 'optimistic check'
      await sendMessageThroughUi(pair.a.page, text)
      await expectMessageVisible(pair.b.page, text)

      await expect(messageBubbles(pair.a.page, text)).toHaveCount(1, { timeout: 3000 })
    } finally {
      await closePair(pair)
    }
  })

  test('shows typing to the other user while composing [BUG-046]', async ({ browser, request }) => {
    test.fail(true, 'BUG-046: the client never emits typing events and never renders the other user typing')
    const pair = await createDirectPair(browser, request, {
      prefixA: 'typa',
      nameA: 'Alice Typing',
      prefixB: 'typb',
      nameB: 'Bob Typing',
    })
    try {
      await openFirstConversation(pair.a.page)
      await openFirstConversation(pair.b.page)

      await pair.a.page.getByPlaceholder('Type a message').fill('typing but not sending')
      await expect(pair.b.page.locator('main header')).toContainText(/typing/i, { timeout: 5000 })
    } finally {
      await closePair(pair)
    }
  })

  test('shows online status for a contact who shares a conversation [BUG-045]', async ({ browser, request }) => {
    test.fail(true, 'BUG-045: the client ignores presence events and renders no online/last-seen status')
    const pair = await createDirectPair(browser, request, {
      prefixA: 'presa',
      nameA: 'Alice Presence',
      prefixB: 'presb',
      nameB: 'Bob Presence',
    })
    try {
      await openFirstConversation(pair.a.page)
      await openFirstConversation(pair.b.page)

      await expect(pair.a.page.locator('main header')).toContainText(/online/i, { timeout: 5000 })
    } finally {
      await closePair(pair)
    }
  })

  test('advances ticks from Sent to Read when the recipient opens the chat [BUG-047]', async ({ browser, request }) => {
    test.fail(true, 'BUG-047: the client never sends delivered/read receipts, so ticks never advance past Sent')
    const pair = await createDirectPair(browser, request, {
      prefixA: 'reada',
      nameA: 'Alice Receipts',
      prefixB: 'readb',
      nameB: 'Bob Receipts',
    })
    try {
      await openFirstConversation(pair.a.page)

      const text = 'receipt check'
      await sendMessageThroughUi(pair.a.page, text)

      const ownRows = messageBubbles(pair.a.page, text)
      const tickLabels = () =>
        ownRows.evaluateAll((rows) =>
          rows.map((row) => row.querySelector('[role="img"]')?.getAttribute('aria-label') ?? null),
        )
      await expect.poll(tickLabels, { timeout: 5000 }).toContain('Sent')

      await openFirstConversation(pair.b.page)
      await expectMessageVisible(pair.b.page, text)

      await expect.poll(tickLabels, { timeout: 5000 }).toContain('Read')
    } finally {
      await closePair(pair)
    }
  })

  test('shows direct-chat identity and last-message time in the list and header [BUG-044]', async ({ browser, request }) => {
    test.fail(true, 'BUG-044: direct rows show "Direct chat", the header shows "Chat", and the list has no time')
    const alice = await registerUser(request, 'listaa', 'Alice List')
    const bob = await registerUser(request, 'listbb', 'Bob List')
    const conversation = await createDirectViaApi(request, alice, bob.user._id)

    const seed = await openUserContext(browser, alice.user)
    try {
      const acks = await seedMessagesThroughSocket(seed.page, conversation._id, ['list preview text'])
      expect(acks.every((ack) => ack?.ok)).toBeTruthy()
    } finally {
      await seed.context.close()
    }

    const a = await openUserContext(browser, alice.user)
    try {
      await expect(a.page.locator('aside')).toContainText('list preview text')
      const asideText = normalizeSpace(await a.page.locator('aside').innerText())
      await openFirstConversation(a.page)
      const headerText = normalizeSpace(await a.page.locator('main header').innerText())

      const observed = {
        listHasName: asideText.includes('Bob List'),
        listHasPreview: asideText.includes('list preview text'),
        listHasTime: /\b\d{1,2}:\d{2}\b/.test(asideText),
        headerHasName: headerText.includes('Bob List'),
      }

      expect(observed).toEqual({
        listHasName: true,
        listHasPreview: true,
        listHasTime: true,
        headerHasName: true,
      })
    } finally {
      await a.context.close()
    }
  })

  test('starts a direct chat by username from the conversation list', async ({ browser, request }) => {
    const alice = await registerUser(request, 'newa', 'Alice New')
    const bob = await registerUser(request, 'newb', 'Bob New')
    const a = await openUserContext(browser, alice.user)
    try {
      await startChatThroughUi(a.page, bob.user.username)
      await expect(a.page.getByPlaceholder('Type a message')).toBeVisible()

      const text = 'started via the new-chat prompt'
      await sendMessageThroughUi(a.page, text)

      let direct
      await expect
        .poll(async () => {
          const response = await request.get(`${API_URL}/conversations`, {
            headers: authHeaders(bob.accessToken),
          })
          const body = await response.json()
          direct = body.conversations.find((conversation) => conversation.type === 'direct')
          return direct?.lastMessage?.text ?? null
        })
        .toBe(text)

      const again = await request.post(`${API_URL}/conversations/direct`, {
        headers: authHeaders(bob.accessToken),
        data: { userId: alice.user._id },
      })
      expect((await again.json()).conversation._id).toBe(direct._id)
    } finally {
      await a.context.close()
    }
  })

  test('loads older history when the message list is scrolled to the top [BUG-051]', async ({ browser, request }) => {
    test.fail(true, 'BUG-051: the client loads only the first page and never requests older messages on scroll')
    const alice = await registerUser(request, 'hista', 'Alice History')
    const bob = await registerUser(request, 'histb', 'Bob History')
    const conversation = await createDirectViaApi(request, alice, bob.user._id)
    const a = await openUserContext(browser, alice.user)
    try {
      const texts = Array.from({ length: 35 }, (_, index) => `history ${String(index).padStart(2, '0')}`)
      const acks = await seedMessagesThroughSocket(a.page, conversation._id, texts)
      expect(acks.filter((ack) => ack?.ok)).toHaveLength(35)

      await openFirstConversation(a.page)
      const bubbles = a.page.locator('[data-message-id]')
      await expect(bubbles).toHaveCount(30)
      expect((await bubbles.allInnerTexts()).join('\n')).not.toContain('history 00')

      const history = await request.get(
        `${API_URL}/conversations/${conversation._id}/messages?limit=100`,
        { headers: authHeaders(alice.accessToken) },
      )
      const { messages } = await history.json()
      expect(messages).toHaveLength(35)
      expect(messages[0].text).toBe('history 00')

      await a.page.locator('main .overflow-auto').first().evaluate((element) => {
        element.scrollTop = 0
      })
      await expect(a.page.getByText('history 00', { exact: true })).toBeVisible({ timeout: 3000 })
    } finally {
      await a.context.close()
    }
  })

  test('loads the emoji picker lazily and inserts at the cursor', async ({ browser, request }) => {
    const pair = await createDirectPair(browser, request, {
      prefixA: 'emoa',
      nameA: 'Alice Emoji',
      prefixB: 'emob',
      nameB: 'Bob Emoji',
    })
    try {
      await openFirstConversation(pair.a.page)
      await openFirstConversation(pair.b.page)

      const requests = trackEmojiPickerRequests(pair.a.page)
      expect(requests).toHaveLength(0)

      const composer = pair.a.page.getByPlaceholder('Type a message')
      await composer.fill('Hello world')
      await composer.evaluate((element) => {
        element.setSelectionRange(5, 5)
        element.focus()
      })

      const search = await openEmojiPicker(pair.a.page)
      await expect(search).toBeVisible()
      expect(requests.length).toBeGreaterThan(0)

      await search.fill('grinning')
      const emoji = pair.a.page.locator('[aria-label="grinning face"]').first()
      await expect(emoji).toBeVisible()
      await emoji.click()

      await expect(composer).toHaveValue('Hello😀 world')
      await expect(composer).toBeFocused()
      await composer.press('Enter')

      await expectMessageVisible(pair.b.page, 'Hello😀 world')
      await expectMessageVisible(pair.a.page, 'Hello😀 world')
    } finally {
      await closePair(pair)
    }
  })

  test('closes the emoji picker on Escape [BUG-052]', async ({ browser, request }) => {
    test.fail(true, 'BUG-052: Escape does not close the emoji picker')
    const pair = await createDirectPair(browser, request, {
      prefixA: 'esca',
      nameA: 'Alice Escape',
      prefixB: 'escb',
      nameB: 'Bob Escape',
    })
    try {
      await openFirstConversation(pair.a.page)
      const search = await openEmojiPicker(pair.a.page)
      await expect(search).toBeVisible()
      await search.focus()
      await search.press('Escape')
      await expect(search).toBeHidden({ timeout: 3000 })
    } finally {
      await closePair(pair)
    }
  })

  test('renders one to three emoji at jumbo size [BUG-035]', async ({ browser, request }) => {
    test.fail(true, 'BUG-035: emoji-only messages render at normal text size')
    const pair = await createDirectPair(browser, request, {
      prefixA: 'jumba',
      nameA: 'Alice Jumbo',
      prefixB: 'jumbb',
      nameB: 'Bob Jumbo',
    })
    try {
      await openFirstConversation(pair.a.page)
      await openFirstConversation(pair.b.page)

      await sendMessageThroughUi(pair.a.page, '😀')
      await expectMessageVisible(pair.b.page, '😀')

      const bubble = messageRow(pair.b.page, '😀').getByText('😀', { exact: true })
      const fontSize = await bubble.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
      expect(fontSize).toBeGreaterThanOrEqual(24)
    } finally {
      await closePair(pair)
    }
  })

  test('renders a URL as a safe link [BUG-036]', async ({ browser, request }) => {
    test.fail(true, 'BUG-036: URLs in messages are rendered as inert plain text')
    const pair = await createDirectPair(browser, request, {
      prefixA: 'linka',
      nameA: 'Alice Link',
      prefixB: 'linkb',
      nameB: 'Bob Link',
    })
    try {
      await openFirstConversation(pair.a.page)
      await openFirstConversation(pair.b.page)

      await sendMessageThroughUi(pair.a.page, 'see https://example.test/page now')
      await expectMessageVisible(pair.b.page, 'https://example.test/page')

      const link = messageRow(pair.b.page, 'https://example.test/page').getByRole('link', {
        name: 'https://example.test/page',
      })
      await expect(link).toHaveAttribute('href', 'https://example.test/page')
      await expect(link).toHaveAttribute('rel', /noopener/)
    } finally {
      await closePair(pair)
    }
  })
})
