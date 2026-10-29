import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Chats from './Chats.jsx'
import ToastHost from '../../components/ui/Toast.jsx'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/auth.js'
import { useNotificationStore } from '../../store/notifications.js'

vi.mock('../../lib/api.js', () => ({ api: vi.fn() }))
vi.mock('emoji-picker-react', async () => {
  const { createElement: create } = await import('react')
  return {
    default: ({ onEmojiClick }) =>
      create('button', { type: 'button', onClick: () => onEmojiClick({ emoji: '😀' }) }, 'Pick emoji'),
  }
})

function localIso(daysAgo, hour, minute) {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

const conversations = [
  {
    _id: 'c1',
    type: 'direct',
    name: 'Alice',
    participants: [
      { user: 'me' },
      { user: 'u2', lastDeliveredMessage: 'm20', lastReadMessage: 'm10' },
    ],
    lastMessage: { text: 'last preview' },
  },
  {
    _id: 'c2',
    type: 'direct',
    name: 'Bob',
    participants: [{ user: 'me' }, { user: 'u3' }],
    lastMessage: { text: 'yo' },
  },
  {
    _id: 'g1',
    type: 'group',
    name: 'Team',
    participants: [{ user: 'me' }, { user: 'u2' }, { user: 'u3' }],
    lastMessage: { text: 'team' },
  },
]

const baseHistory = {
  c1: [
    {
      _id: 'm0',
      conversation: 'c1',
      sender: { _id: 'u2', displayName: 'Alice' },
      type: 'text',
      text: 'older message',
      createdAt: localIso(1, 23, 59),
    },
    {
      _id: 'm1',
      conversation: 'c1',
      sender: { _id: 'u2', displayName: 'Alice' },
      type: 'text',
      text: 'history message',
      createdAt: localIso(0, 0, 1),
    },
  ],
  c2: [],
  g1: [],
}

let history

function dispatchMessage(message) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent('ws-message', { detail: { type: 'message:new', message } }),
    )
  })
}

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

async function openConversation(user, name) {
  await user.click(await screen.findByText(name))
  await waitFor(() => expect(screen.getAllByText(name).length).toBeGreaterThan(1))
}

beforeEach(() => {
  history = { c1: baseHistory.c1.map((message) => ({ ...message })), c2: [], g1: [] }

  api.mockImplementation((path) => {
    if (path === '/conversations') return Promise.resolve({ conversations })
    const match = path.match(/^\/conversations\/(.+)\/messages$/)
    if (match) return Promise.resolve({ messages: history[match[1]] || [] })
    return Promise.resolve({})
  })

  useNotificationStore.setState({
    unread: {},
    totalUnread: 0,
    soundEnabled: true,
    desktopEnabled: false,
  })
  useAuthStore.setState({ user: { _id: 'me' }, accessToken: 'token' })
  document.title = 'ChatSphere'
  window.__socket = { connected: true, emit: vi.fn() }
  vi.spyOn(window, 'alert').mockImplementation(() => {})
})

describe('message loading and composer', () => {
  it('loads history and clears the unread count when a conversation opens', async () => {
    useNotificationStore.setState({ unread: { c1: 2 }, totalUnread: 2 })
    document.title = '(2) ChatSphere'
    const user = userEvent.setup()
    render(<Chats />)

    await openConversation(user, 'Alice')

    expect(await screen.findByText('history message')).toBeInTheDocument()
    expect(useNotificationStore.getState().unread.c1).toBe(0)
    expect(document.title).toBe('ChatSphere')
  })

  it('sends on Enter, renders the optimistic bubble, and clears the draft', async () => {
    const user = userEvent.setup()
    render(<Chats />)
    await openConversation(user, 'Alice')
    const textarea = screen.getByPlaceholderText('Type a message')

    await user.type(textarea, 'hello world')
    await user.keyboard('{Enter}')

    expect(window.__socket.emit).toHaveBeenCalledTimes(1)
    const [event, payload, ack] = window.__socket.emit.mock.calls[0]
    expect(event).toBe('message:send')
    expect(payload).toMatchObject({ conversationId: 'c1', type: 'text', text: 'hello world' })
    expect(payload.clientId).toEqual(expect.any(String))
    expect(typeof ack).toBe('function')
    expect(screen.getByText('hello world')).toBeInTheDocument()
    expect(textarea).toHaveValue('')
    expect(localStorage.getItem('draft:c1')).toBeFalsy()
  })

  it('inserts a newline on Shift+Enter without sending', async () => {
    const user = userEvent.setup()
    render(<Chats />)
    await openConversation(user, 'Alice')
    const textarea = screen.getByPlaceholderText('Type a message')

    await user.type(textarea, 'line one')
    await user.keyboard('{Shift>}{Enter}{/Shift}')

    expect(window.__socket.emit).not.toHaveBeenCalled()
    expect(textarea.value).toContain('line one')
  })

  it('ignores a whitespace-only message', async () => {
    const user = userEvent.setup()
    render(<Chats />)
    await openConversation(user, 'Alice')
    const textarea = screen.getByPlaceholderText('Type a message')

    await user.type(textarea, '   ')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(window.__socket.emit).not.toHaveBeenCalled()
    expect(textarea).toHaveValue('   ')
  })

  it('asks the user to open a conversation before sending', async () => {
    const user = userEvent.setup()
    render(<Chats />)
    await screen.findByText('Alice')
    const textarea = screen.getByPlaceholderText('Type a message')

    await user.type(textarea, 'no chat selected')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(window.alert).toHaveBeenCalledWith('Select or create a chat first')
    expect(window.__socket.emit).not.toHaveBeenCalled()
  })

  it('keeps a separate draft per conversation', async () => {
    const user = userEvent.setup()
    render(<Chats />)
    await openConversation(user, 'Alice')
    const textarea = screen.getByPlaceholderText('Type a message')

    await user.type(textarea, 'draft for alice')
    await user.click(screen.getByText('Bob'))
    await waitFor(() => expect(screen.getByPlaceholderText('Type a message')).toHaveValue(''))

    await user.click(screen.getByText('Alice'))
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Type a message')).toHaveValue('draft for alice'),
    )
  })

  it('BUG-095 / CHAT-021: a superseded history response never replaces the active conversation', async () => {
    const bobHistory = deferred()
    api.mockImplementation((path) => {
      if (path === '/conversations') return Promise.resolve({ conversations })
      if (path === '/conversations/c2/messages') return bobHistory.promise
      if (path === '/conversations/c1/messages') return Promise.resolve({ messages: history.c1 })
      return Promise.resolve({})
    })
    const user = userEvent.setup()
    render(<Chats />)

    await user.click(await screen.findByText('Bob'))
    await waitFor(() => expect(screen.getAllByText('Bob').length).toBeGreaterThan(1))

    await user.click(screen.getByText('Alice'))
    expect(await screen.findByText('history message')).toBeInTheDocument()

    await act(async () => {
      bobHistory.resolve({
        messages: [{
          _id: 'b1',
          conversation: 'c2',
          sender: { _id: 'u3', displayName: 'Bob' },
          type: 'text',
          text: 'late Bob history',
          createdAt: localIso(0, 9, 0),
        }],
      })
      await bobHistory.promise
    })

    await waitFor(() => expect(screen.getAllByText('Alice').length).toBeGreaterThan(1))
    expect(screen.queryByText('late Bob history')).toBeNull()
    expect(screen.getByText('history message')).toBeInTheDocument()
  })

  it('inserts an emoji at the cursor and returns focus to the composer', async () => {
    const user = userEvent.setup()
    render(<Chats />)
    await openConversation(user, 'Alice')
    const textarea = screen.getByPlaceholderText('Type a message')

    await user.type(textarea, 'hello')
    textarea.setSelectionRange(2, 2)
    await user.click(screen.getByRole('button', { name: '🙂' }))
    await user.click(await screen.findByRole('button', { name: 'Pick emoji' }))

    await waitFor(() => expect(textarea).toHaveValue('he😀llo'))
    await waitFor(() => expect(textarea).toHaveFocus())
    expect(textarea.selectionStart).toBe(4)
  })

  it('renders HTML in a message as plain text', async () => {
    const user = userEvent.setup()
    render(<Chats />)
    await openConversation(user, 'Alice')
    const payload = '<img src=x onerror="window.__xss=1">'

    dispatchMessage({
      _id: 'mx',
      conversation: 'c1',
      sender: { _id: 'u2', displayName: 'Alice' },
      type: 'text',
      text: payload,
      createdAt: new Date().toISOString(),
    })

    expect(await screen.findByText(payload)).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
    expect(window.__xss).toBeUndefined()
  })
})

describe('notifications', () => {
  it('increments unread and shows a toast for a conversation that is not open', async () => {
    render(
      <>
        <Chats />
        <ToastHost />
      </>,
    )
    await screen.findByText('Alice')

    dispatchMessage({
      _id: 'n1',
      conversation: 'c2',
      sender: { _id: 'u3', displayName: 'Carol' },
      type: 'text',
      text: 'ping',
      createdAt: new Date().toISOString(),
    })

    expect(useNotificationStore.getState().unread.c2).toBe(1)
    expect(document.title).toBe('(1) ChatSphere')
    expect(await screen.findByRole('status')).toHaveTextContent('New message')
  })

  it('does not notify for a message in the open conversation', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Chats />
        <ToastHost />
      </>,
    )
    await openConversation(user, 'Alice')

    dispatchMessage({
      _id: 'n2',
      conversation: 'c1',
      sender: { _id: 'u2', displayName: 'Alice' },
      type: 'text',
      text: 'live hello',
      createdAt: new Date().toISOString(),
    })

    expect(await screen.findByText('live hello')).toBeInTheDocument()
    expect(useNotificationStore.getState().unread.c1).toBe(0)
    expect(useNotificationStore.getState().totalUnread).toBe(0)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows a desktop notification only when the tab is hidden and enabled', async () => {
    useNotificationStore.setState({ desktopEnabled: true })
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    const NotificationMock = vi.fn()
    vi.stubGlobal('Notification', NotificationMock)
    render(<Chats />)
    await screen.findByText('Alice')

    dispatchMessage({
      _id: 'n3',
      conversation: 'c2',
      sender: { _id: 'u3', displayName: 'Carol' },
      type: 'text',
      text: 'background ping',
      createdAt: new Date().toISOString(),
    })

    expect(NotificationMock).toHaveBeenCalledWith('New message', { body: 'background ping' })
  })

  it('does not show a desktop notification while the tab is visible', async () => {
    useNotificationStore.setState({ desktopEnabled: true })
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const NotificationMock = vi.fn()
    vi.stubGlobal('Notification', NotificationMock)
    render(<Chats />)
    await screen.findByText('Alice')

    dispatchMessage({
      _id: 'n4',
      conversation: 'c2',
      sender: { _id: 'u3', displayName: 'Carol' },
      type: 'text',
      text: 'foreground ping',
      createdAt: new Date().toISOString(),
    })

    expect(NotificationMock).not.toHaveBeenCalled()
  })

  it.fails('BUG-037 / NOTIF-003: does not notify when the sender is the current user in another tab', async () => {
    render(
      <>
        <Chats />
        <ToastHost />
      </>,
    )
    await screen.findByText('Alice')

    dispatchMessage({
      _id: 'n5',
      conversation: 'c2',
      sender: { _id: 'me' },
      type: 'text',
      text: 'sent from my phone',
      createdAt: new Date().toISOString(),
    })

    expect(useNotificationStore.getState().unread.c2).toBeUndefined()
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('message list presentation', () => {
  it('TS-002: shows a locale-aware time and the full date on hover on every bubble', async () => {
    const user = userEvent.setup()
    render(<Chats />)
    await openConversation(user, 'Alice')
    await screen.findByText('history message')

    expect(screen.getAllByText(/^\d{1,2}:\d{2}(\s?[AP]M)?$/)).toHaveLength(2)
    expect(screen.getByText('history message').closest('[data-message-id]')).toHaveAttribute(
      'title',
      expect.stringMatching(/\d{4}/),
    )
  })

  it('TS-003: separates messages by date', async () => {
    const user = userEvent.setup()
    render(<Chats />)
    await openConversation(user, 'Alice')
    await screen.findByText('history message')

    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Yesterday')).toBeInTheDocument()
  })

  it('groups consecutive messages from the same sender within five minutes', async () => {
    history.c1 = [
      {
        _id: 'g1a',
        conversation: 'c1',
        sender: { _id: 'u2', displayName: 'Alice' },
        type: 'text',
        text: 'first grouped',
        createdAt: localIso(0, 12, 0),
      },
      {
        _id: 'g1b',
        conversation: 'c1',
        sender: { _id: 'u2', displayName: 'Alice' },
        type: 'text',
        text: 'second grouped',
        createdAt: localIso(0, 12, 2),
      },
      {
        _id: 'g1c',
        conversation: 'c1',
        sender: { _id: 'u2', displayName: 'Alice' },
        type: 'text',
        text: 'after the gap',
        createdAt: localIso(0, 12, 9),
      },
    ]
    const user = userEvent.setup()
    render(<Chats />)
    await openConversation(user, 'Alice')
    await screen.findByText('second grouped')

    expect(screen.getByText('second grouped').closest('[data-message-id]')).toHaveAttribute(
      'data-grouped',
      'true',
    )
    expect(screen.getByText('after the gap').closest('[data-message-id]')).toHaveAttribute(
      'data-grouped',
      'false',
    )
  })

  it('shows one sender label per group run with a per-user color', async () => {
    history.g1 = [
      {
        _id: 'gg1',
        conversation: 'g1',
        sender: { _id: 'u2', displayName: 'Alice' },
        type: 'text',
        text: 'hello team',
        createdAt: localIso(0, 13, 0),
      },
      {
        _id: 'gg2',
        conversation: 'g1',
        sender: { _id: 'u2', displayName: 'Alice' },
        type: 'text',
        text: 'agreed',
        createdAt: localIso(0, 13, 1),
      },
      {
        _id: 'gg3',
        conversation: 'g1',
        sender: { _id: 'u3', displayName: 'Carol' },
        type: 'text',
        text: 'hi both',
        createdAt: localIso(0, 13, 2),
      },
    ]
    const user = userEvent.setup()
    render(<Chats />)
    await openConversation(user, 'Team')
    await screen.findByText('hello team')

    const aliceLabel = document.querySelector('[data-sender-name="Alice"]')
    const carolLabel = document.querySelector('[data-sender-name="Carol"]')
    expect(document.querySelectorAll('[data-sender-name="Alice"]')).toHaveLength(1)
    expect(aliceLabel).not.toBeNull()
    expect(carolLabel).not.toBeNull()
    expect(aliceLabel.style.color).not.toBe(carolLabel.style.color)
  })

  it('derives sent, delivered, and read ticks from the conversation pointers', async () => {
    history.c1.push(
      {
        _id: 'm05',
        conversation: 'c1',
        sender: { _id: 'me' },
        type: 'text',
        text: 'read message',
        createdAt: localIso(0, 0, 5),
      },
      {
        _id: 'm15',
        conversation: 'c1',
        sender: { _id: 'me' },
        type: 'text',
        text: 'delivered message',
        createdAt: localIso(0, 0, 6),
      },
      {
        _id: 'm25',
        conversation: 'c1',
        sender: { _id: 'me' },
        type: 'text',
        text: 'sent message',
        createdAt: localIso(0, 0, 7),
      },
    )
    const user = userEvent.setup()
    render(<Chats />)
    await openConversation(user, 'Alice')
    await screen.findByText('read message')

    expect(screen.getByLabelText('Read')).toBeInTheDocument()
    expect(screen.getByLabelText('Delivered')).toBeInTheDocument()
    expect(screen.getByLabelText('Sent')).toBeInTheDocument()
  })

  it.fails('BUG-035 / EMO-003: renders messages made only of emoji at a large size', async () => {
    history.c1.push({
      _id: 'mj',
      conversation: 'c1',
      sender: { _id: 'u2', displayName: 'Alice' },
      type: 'text',
      text: '😀',
      createdAt: '2026-10-25T10:05:00.000Z',
    })
    const user = userEvent.setup()
    render(<Chats />)
    await openConversation(user, 'Alice')

    expect(screen.getByText('😀').className).toMatch(/text-(2xl|3xl|4xl)/)
  })

  it.fails('BUG-036 / CHAT-007: renders URLs as safe links', async () => {
    history.c1.push({
      _id: 'ml',
      conversation: 'c1',
      sender: { _id: 'u2', displayName: 'Alice' },
      type: 'text',
      text: 'see https://example.test/page now',
      createdAt: '2026-10-25T10:06:00.000Z',
    })
    const user = userEvent.setup()
    render(<Chats />)
    await openConversation(user, 'Alice')

    const link = screen.getByRole('link', { name: 'https://example.test/page' })
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })
})

describe('optimistic send reconciliation', () => {
  it.fails('BUG-034 / CHAT-009: replaces the optimistic bubble when the server echo arrives', async () => {
    const user = userEvent.setup()
    render(<Chats />)
    await openConversation(user, 'Alice')
    const textarea = screen.getByPlaceholderText('Type a message')

    await user.type(textarea, 'hello world')
    await user.keyboard('{Enter}')
    const [, payload] = window.__socket.emit.mock.calls[0]

    dispatchMessage({
      _id: 'server-1',
      clientId: payload.clientId,
      conversation: 'c1',
      sender: { _id: 'me' },
      type: 'text',
      text: 'hello world',
      createdAt: '2026-10-25T10:10:00.000Z',
    })

    expect(screen.getAllByText('hello world')).toHaveLength(1)
  })

  it.fails('BUG-034 / CHAT-009: marks a send on a disconnected socket as failed and offers a retry', async () => {
    const user = userEvent.setup()
    render(<Chats />)
    await openConversation(user, 'Alice')
    window.__socket = { connected: false, emit: vi.fn() }
    const textarea = screen.getByPlaceholderText('Type a message')

    await user.type(textarea, 'queued while offline')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(screen.getByText(/failed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})

describe('stored XSS rendering (Testing.md 6.1)', () => {
  const payload = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>'

  it('renders a group name payload as inert text in the list and header', async () => {
    const user = userEvent.setup()
    const originalName = conversations[2].name
    conversations[2].name = payload
    try {
      render(<Chats />)
      await user.click(await screen.findByText(payload))
      await waitFor(() => expect(screen.getAllByText(payload).length).toBeGreaterThan(1))
      expect(document.querySelector('img, script')).toBeNull()
      expect(window.__xss).toBeUndefined()
    } finally {
      conversations[2].name = originalName
    }
  })

  it('renders a group sender-name payload as inert text', async () => {
    const user = userEvent.setup()
    history.g1.push({
      _id: 'gx1',
      conversation: 'g1',
      sender: { _id: 'u2', displayName: payload },
      type: 'text',
      text: 'group hello',
      createdAt: new Date().toISOString(),
    })
    render(<Chats />)
    await openConversation(user, 'Team')
    expect(await screen.findByText(payload)).toBeInTheDocument()
    const senderLabel = document.querySelector('[data-sender-name]')
    expect(senderLabel?.textContent).toBe(payload)
    expect(document.querySelector('img, script')).toBeNull()
    expect(window.__xss).toBeUndefined()
  })

  it('renders a file-name payload as inert text', async () => {
    const user = userEvent.setup()
    render(<Chats />)
    await openConversation(user, 'Alice')
    const filePayload = '<img src=x onerror=window.__xss=1>.zip'
    dispatchMessage({
      _id: 'fx1',
      conversation: 'c1',
      sender: { _id: 'u2', displayName: 'Alice' },
      type: 'file',
      text: '',
      attachments: [{ mimeType: 'application/zip', size: 2048, originalName: filePayload }],
      createdAt: new Date().toISOString(),
    })
    expect(await screen.findByText(filePayload)).toBeInTheDocument()
    expect(document.querySelector('img, script')).toBeNull()
    expect(window.__xss).toBeUndefined()
  })
})
