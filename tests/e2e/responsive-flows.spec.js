import { expect, test } from '@playwright/test'
import {
  VIEWPORTS,
  openSeededChat,
  waitForStableUi,
} from '../helpers/appearance.js'
import { expectMessageVisible, sendMessageThroughUi } from '../helpers/flows.js'

const PHONE = { width: 390, height: 844 }
const TABLET = { width: 768, height: 1024 }
const LAPTOP = { width: 1024, height: 768 }
const DESKTOP = { width: 1440, height: 900 }

async function layoutSnapshot(page) {
  return page.evaluate(() => {
    const box = (element) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const hidden =
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0 ||
        rect.width === 0 ||
        rect.height === 0
      if (hidden) return null
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    }

    const main = document.querySelector('main')
    const asides = Array.from(document.querySelectorAll('aside'))
    const list = asides.find((element) => element.querySelector('input[placeholder="Search"]'))
    const info = asides.find((element) => element.querySelector('[role="tablist"]'))
    const rail = asides.find((element) => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.width <= 90 && getComputedStyle(element).display !== 'none'
    })
    const navs = Array.from(document.querySelectorAll('nav, [role="navigation"]'))
      .map((element) => box(element))
      .filter(Boolean)
    const bottomNav = navs.find(
      (rect) => rect.top > window.innerHeight * 0.7 && rect.width > window.innerWidth * 0.5,
    )
    const header = main?.querySelector('header')
    const backButton = header?.querySelector('button[aria-label="Back"], button[aria-label*="back" i]')
    const composer = main?.querySelector(':scope > div.border-t')
    const textarea = main?.querySelector('textarea')
    const root = document.documentElement

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
      },
      horizontalOverflow:
        root.scrollWidth > root.clientWidth + 1 ||
        document.body.scrollWidth > window.innerWidth + 1,
      main: box(main),
      mainOverflowX: main ? main.scrollWidth > main.clientWidth + 1 : null,
      list: box(list),
      info: box(info),
      rail: box(rail),
      header: box(header),
      backButton: Boolean(backButton),
      composer: box(composer),
      textarea: box(textarea),
      bottomNav: bottomNav || null,
    }
  })
}

function clippingFailures(label, snapshot) {
  const failures = []
  const { viewport } = snapshot
  if (snapshot.horizontalOverflow) {
    failures.push(
      `${label}: horizontal overflow — document ${snapshot.document.scrollWidth}px vs viewport ${snapshot.document.clientWidth}px`,
    )
  }
  for (const pane of ['list', 'main', 'info']) {
    const rect = snapshot[pane]
    if (rect && (rect.left < -1 || rect.right > viewport.width + 1)) {
      failures.push(`${label}: ${pane} pane clipped horizontally (${rect.left}…${rect.right} of ${viewport.width})`)
    }
  }
  if (snapshot.header && snapshot.header.right > viewport.width + 1) {
    failures.push(`${label}: chat header clipped (right ${snapshot.header.right} > ${viewport.width})`)
  }
  if (snapshot.composer) {
    if (snapshot.composer.right > viewport.width + 1) {
      failures.push(`${label}: composer clipped horizontally (right ${snapshot.composer.right} > ${viewport.width})`)
    }
    if (snapshot.composer.bottom > viewport.height + 1) {
      failures.push(`${label}: composer below the viewport (bottom ${snapshot.composer.bottom} > ${viewport.height})`)
    }
  }
  if (snapshot.textarea && snapshot.textarea.width < 160) {
    failures.push(`${label}: message textarea squeezed to ${snapshot.textarea.width}px`)
  }
  if (snapshot.mainOverflowX) {
    failures.push(`${label}: chat pane content overflows its own width`)
  }
  return failures
}

async function collectTargets(page) {
  return page.evaluate(() => {
    const selector =
      'button, a[href], textarea, input:not([type="hidden"]):not([type="file"]), [role="menuitem"], [role="tab"]'
    return Array.from(document.querySelectorAll(selector))
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        if (
          rect.width === 0 ||
          rect.height === 0 ||
          style.visibility === 'hidden' ||
          style.display === 'none'
        ) {
          return null
        }
        return {
          label: (
            element.getAttribute('aria-label') ||
            element.textContent ||
            element.getAttribute('placeholder') ||
            element.tagName
          )
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 40),
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        }
      })
      .filter(Boolean)
  })
}

test.describe('Responsive layouts (6.3)', () => {
  for (const viewport of VIEWPORTS) {
    test(`core chat flow works at ${viewport.name}`, async ({ browser, request }) => {
      const chat = await openSeededChat(browser, request, {
        viewport: { width: viewport.width, height: viewport.height },
        prefixA: `r${viewport.width}a`,
        prefixB: `r${viewport.width}b`,
        messages: [`Layout seed at ${viewport.name}`],
      })
      try {
        const snapshot = await layoutSnapshot(chat.page)
        console.log(`[layout] ${viewport.name} ${JSON.stringify(snapshot)}`)
        const text = `Sent from ${viewport.name}`
        await sendMessageThroughUi(chat.page, text)
        await expectMessageVisible(chat.page, text)
      } finally {
        await chat.context.close()
      }
    })
  }

  test('no viewport scrolls horizontally or clips the chat composer', async ({ browser, request }) => {
    test.fail(true, 'BUG-067: no responsive layout — phone widths overflow and the chat is clipped')
    const chat = await openSeededChat(browser, request, {
      prefixA: 'rnoa',
      prefixB: 'rnob',
    })
    try {
      const failures = []
      for (const viewport of VIEWPORTS) {
        await chat.page.setViewportSize({ width: viewport.width, height: viewport.height })
        await waitForStableUi(chat.page)
        const snapshot = await layoutSnapshot(chat.page)
        console.log(`[clipping] ${viewport.name} ${JSON.stringify(snapshot)}`)
        failures.push(...clippingFailures(viewport.name, snapshot))
      }
      expect(failures).toEqual([])
    } finally {
      await chat.context.close()
    }
  })

  test('phone layout uses one pane with a bottom bar and back navigation', async ({ browser, request }) => {
    test.fail(true, 'BUG-067: phone keeps the list beside a clipped chat with no bottom bar or back button')
    const chat = await openSeededChat(browser, request, {
      viewport: PHONE,
      prefixA: 'rphoa',
      prefixB: 'rphob',
    })
    try {
      const snapshot = await layoutSnapshot(chat.page)
      console.log(`[phone] ${JSON.stringify(snapshot)}`)
      expect(snapshot.bottomNav, 'phone bottom navigation bar').not.toBeNull()
      expect(snapshot.backButton, 'back button in the chat header').toBe(true)
      expect(snapshot.list, 'conversation list while a chat is open').toBeNull()
    } finally {
      await chat.context.close()
    }
  })

  test('tablet layout keeps the side rail and two content columns', async ({ browser, request }) => {
    test.fail(true, 'BUG-067: there is no side rail at tablet widths')
    const chat = await openSeededChat(browser, request, {
      viewport: TABLET,
      prefixA: 'rtaba',
      prefixB: 'rtabb',
    })
    try {
      const snapshot = await layoutSnapshot(chat.page)
      console.log(`[tablet] ${JSON.stringify(snapshot)}`)
      expect(snapshot.rail, 'side rail').not.toBeNull()
      expect(snapshot.rail.width).toBeGreaterThanOrEqual(64)
      expect(snapshot.rail.width).toBeLessThanOrEqual(80)
      expect(snapshot.info, 'permanent info column below 1280px').toBeNull()
      expect(snapshot.list.width).toBeGreaterThanOrEqual(300)
      expect(snapshot.main.width).toBeGreaterThan(300)
    } finally {
      await chat.context.close()
    }
  })

  test('laptop layout uses the rail, list, and chat without a permanent fourth column', async ({ browser, request }) => {
    test.fail(true, 'BUG-067: no rail at laptop width and the info panel is a permanent column instead of an overlay')
    const chat = await openSeededChat(browser, request, {
      viewport: LAPTOP,
      prefixA: 'rlapa',
      prefixB: 'rlapb',
    })
    try {
      const snapshot = await layoutSnapshot(chat.page)
      console.log(`[laptop] ${JSON.stringify(snapshot)}`)
      expect(snapshot.rail, 'side rail').not.toBeNull()
      expect(snapshot.list.width).toBeGreaterThanOrEqual(300)
      expect(snapshot.main.width).toBeGreaterThan(380)
      expect(snapshot.info, 'info column at 1024px (should be an overlay)').toBeNull()
    } finally {
      await chat.context.close()
    }
  })

  test('desktop layout shows all four panes', async ({ browser, request }) => {
    test.fail(true, 'BUG-067: the 72px side rail is missing at 1440px')
    const chat = await openSeededChat(browser, request, {
      viewport: DESKTOP,
      prefixA: 'rdesa',
      prefixB: 'rdesb',
    })
    try {
      const snapshot = await layoutSnapshot(chat.page)
      console.log(`[desktop] ${JSON.stringify(snapshot)}`)
      expect(snapshot.rail, 'side rail').not.toBeNull()
      expect(snapshot.rail.width).toBeGreaterThanOrEqual(64)
      expect(snapshot.rail.width).toBeLessThanOrEqual(80)
      expect(snapshot.list.width).toBeGreaterThanOrEqual(320)
      expect(snapshot.info, 'info panel').not.toBeNull()
      expect(snapshot.info.width).toBeGreaterThanOrEqual(300)
      expect(snapshot.info.width).toBeLessThanOrEqual(340)
      expect(snapshot.main.width).toBeGreaterThan(500)
    } finally {
      await chat.context.close()
    }
  })

  test('phone touch targets are at least 44px', async ({ browser, request }) => {
    test.fail(true, 'BUG-068: all eight phone controls measure 32–38px tall')
    const chat = await openSeededChat(browser, request, {
      viewport: PHONE,
      prefixA: 'rtcha',
      prefixB: 'rtchb',
    })
    try {
      const targets = await collectTargets(chat.page)
      const small = targets.filter((target) => target.width < 44 || target.height < 44)
      console.log(`[touch] ${targets.length} targets, ${small.length} below 44px: ${JSON.stringify(small)}`)
      expect(small).toEqual([])
    } finally {
      await chat.context.close()
    }
  })

  test('the composer stays above an emulated phone keyboard', async ({ browser, request }) => {
    const chat = await openSeededChat(browser, request, {
      viewport: PHONE,
      prefixA: 'rkba',
      prefixB: 'rkbb',
    })
    try {
      await chat.page.setViewportSize({ width: PHONE.width, height: 500 })
      await waitForStableUi(chat.page)
      const snapshot = await layoutSnapshot(chat.page)
      console.log(`[keyboard] ${JSON.stringify(snapshot)}`)
      expect(snapshot.composer, 'composer').not.toBeNull()
      expect(snapshot.composer.bottom).toBeLessThanOrEqual(500)
      expect(snapshot.textarea.width).toBeGreaterThanOrEqual(160)
    } finally {
      await chat.context.close()
    }
  })

  test('forms remain usable at 200% zoom', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:5175',
      viewport: { width: 720, height: 450 },
    })
    const page = await context.newPage()
    try {
      await page.goto('/login')
      const identifier = page.getByPlaceholder('Email or username')
      await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
      await expect(identifier).toBeVisible()
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        identifierWidth: Math.round(document.querySelector('input').getBoundingClientRect().width),
      }))
      console.log(`[zoom] ${JSON.stringify(metrics)}`)
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1)
      expect(metrics.identifierWidth).toBeGreaterThanOrEqual(160)
    } finally {
      await context.close()
    }
  })

  test('wraps a 4,000-character unbroken token without horizontal page overflow [BUG-096]', async ({ browser, request }) => {
    const chat = await openSeededChat(browser, request, {
      viewport: DESKTOP,
      prefixA: 'longa',
      prefixB: 'longb',
      messages: ['seed before the long word'],
    })
    try {
      const longWord = 'W'.repeat(4000)
      await sendMessageThroughUi(chat.page, longWord)
      await expect
        .poll(() =>
          chat.page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-message-id]')).some((bubble) =>
              (bubble.textContent || '').includes('W'.repeat(50)),
            ),
          ),
        )
        .toBe(true)
      const metrics = await chat.page.evaluate(() => {
        const pane = document.querySelector('main .overflow-auto')
        return {
          documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
          paneOverflow: pane ? pane.scrollWidth - pane.clientWidth : null,
        }
      })
      console.log(`[long-word] ${JSON.stringify(metrics)}`)
      expect(metrics.documentOverflow, 'horizontal document overflow in px').toBeLessThanOrEqual(0)
      expect(metrics.paneOverflow, 'horizontal overflow inside the message pane in px').toBeLessThanOrEqual(0)
    } finally {
      await chat.context.close()
    }
  })
})
