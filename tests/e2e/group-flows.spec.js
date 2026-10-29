import { expect, test } from '@playwright/test'
import {
  createGroupViaApi,
  expectMessageVisible,
  openConversationNamed,
  openUserContext,
  registerUser,
  sendMessageThroughUi,
} from '../helpers/flows.js'

async function openGroupContexts(browser, request, groupName) {
  const alice = await registerUser(request, 'grpa', 'Alice Group')
  const bob = await registerUser(request, 'grpb', 'Bob Group')
  const carol = await registerUser(request, 'grpc', 'Carol Group')
  const conversation = await createGroupViaApi(
    request,
    alice,
    [bob.user._id, carol.user._id],
    groupName,
  )
  const a = await openUserContext(browser, alice.user)
  const b = await openUserContext(browser, bob.user)
  const c = await openUserContext(browser, carol.user)
  return { alice, bob, carol, conversation, a, b, c }
}

async function closeGroup(pair) {
  await pair?.a?.context.close()
  await pair?.b?.context.close()
  await pair?.c?.context.close()
}

test.describe('E2E group chat flows (5.8)', () => {
  test('delivers a group message to every member in real time and renders the system message', async ({ browser, request }) => {
    const groupName = `Squad ${Date.now()}`
    const group = await openGroupContexts(browser, request, groupName)
    try {
      for (const page of [group.a.page, group.b.page, group.c.page]) {
        await openConversationNamed(page, groupName)
      }

      await expect(group.b.page.locator('main').getByText('Group created', { exact: true })).toBeVisible()

      const text = 'group hello'
      await sendMessageThroughUi(group.a.page, text)
      await expectMessageVisible(group.b.page, text)
      await expectMessageVisible(group.c.page, text)
      await expectMessageVisible(group.a.page, text)
    } finally {
      await closeGroup(group)
    }
  })

  test('shows the sender name and per-user color on group bubbles [BUG-048]', async ({ browser, request }) => {
    test.fail(true, 'BUG-048: message.sender is an ObjectId string, so MessageList cannot render the sender name')
    const groupName = `Names ${Date.now()}`
    const group = await openGroupContexts(browser, request, groupName)
    try {
      await openConversationNamed(group.a.page, groupName)
      await openConversationNamed(group.b.page, groupName)

      const text = 'sender identity check'
      await sendMessageThroughUi(group.a.page, text)
      await expectMessageVisible(group.b.page, text)

      const label = group.b.page
        .locator('[data-message-id]')
        .filter({ hasText: text })
        .first()
        .locator('[data-sender-name]')
      await expect(label).toHaveCount(1)
      await expect(label).toHaveAttribute('data-sender-name', 'Alice Group')
    } finally {
      await closeGroup(group)
    }
  })

  test('creates a group through the UI with a name and at least two members [BUG-049]', async ({ browser, request }) => {
    test.fail(true, 'BUG-049: the UI has no New group action or group creation form')
    const groupName = `Created ${Date.now()}`
    const group = await openGroupContexts(browser, request, groupName)
    try {
      const newGroup = group.a.page.getByRole('button', { name: /new group/i })
      await expect(newGroup).toHaveCount(1)
      await newGroup.click()
      await expect(group.a.page.getByPlaceholder(/group name/i)).toBeVisible()
    } finally {
      await closeGroup(group)
    }
  })

  test('shows group details and the member list in an info panel [BUG-049]', async ({ browser, request }) => {
    test.fail(true, 'BUG-049: no info panel toggle, group details, or member list exists')
    const groupName = `Info ${Date.now()}`
    const group = await openGroupContexts(browser, request, groupName)
    try {
      await openConversationNamed(group.a.page, groupName)

      const infoToggle = group.a.page.locator('main header').getByRole('button', { name: /info|details/i })
      await expect(infoToggle).toHaveCount(1)
      await infoToggle.click()

      const panel = group.a.page.getByRole('complementary').filter({ hasText: /members/i })
      await expect(panel).toBeVisible()
      await expect(panel).toContainText('Bob Group')
      await expect(panel).toContainText('Carol Group')
    } finally {
      await closeGroup(group)
    }
  })

  test('shows group typing text with the sender name [BUG-046]', async ({ browser, request }) => {
    test.fail(true, 'BUG-046: group typing is neither emitted by the sender nor rendered for members')
    const groupName = `Typing ${Date.now()}`
    const group = await openGroupContexts(browser, request, groupName)
    try {
      await openConversationNamed(group.a.page, groupName)
      await openConversationNamed(group.b.page, groupName)

      await group.a.page.getByPlaceholder('Type a message').fill('typing in the group')
      await expect(group.b.page.locator('main header')).toContainText(/alice group is typing/i, {
        timeout: 5000,
      })
    } finally {
      await closeGroup(group)
    }
  })
})
