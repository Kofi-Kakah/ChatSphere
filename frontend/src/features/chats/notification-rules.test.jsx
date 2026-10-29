import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Chats from './Chats.jsx'
import ToastHost from '../../components/ui/Toast.jsx'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/auth.js'
import { useNotificationStore } from '../../store/notifications.js'

vi.mock('../../lib/api.js', () => ({ api: vi.fn() }))

const HOUR = 60 * 60 * 1000
let conversations

function conversation({ id, name, mutedUntil = null }) {
  return {
    _id: id,
    type: 'direct',
    name,
    participants: [
      { user: 'me', mutedUntil },
      { user: `peer-${id}` },
    ],
    lastMessage: { text: 'preview' },
  }
}

function dispatchMessage(message) {
  act(() => {
    window.dispatchEvent(new CustomEvent('ws-message', { detail: { type: 'message:new', message } }))
  })
}

function incoming(conversationId, text) {
  return {
    _id: `msg-${Math.random().toString(36).slice(2)}`,
    conversation: conversationId,
    sender: { _id: `peer-${conversationId}`, displayName: 'Peer' },
    type: 'text',
    text,
    createdAt: new Date().toISOString(),
  }
}

function renderChats() {
  return render(
    <>
      <Chats />
      <ToastHost />
    </>,
  )
}

beforeEach(() => {
  conversations = [conversation({ id: 'c1', name: 'Alice' }), conversation({ id: 'c2', name: 'Bob' })]
  api.mockImplementation((path) => {
    if (path === '/conversations') return Promise.resolve({ conversations })
    if (/\/messages$/.test(path)) return Promise.resolve({ messages: [] })
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
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('notification suppression rules (5.13)', () => {
  it.fails('MUTE-101 / BUG-078: a muted conversation sends no toast, unread, title, or desktop notice until the mute expires', async () => {
    const start = new Date('2026-10-26T12:00:00.000Z')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(start)
    conversations[1] = conversation({
      id: 'c2',
      name: 'Bob',
      mutedUntil: new Date(start.getTime() + HOUR).toISOString(),
    })
    useNotificationStore.setState({ desktopEnabled: true })
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    const NotificationMock = vi.fn()
    vi.stubGlobal('Notification', NotificationMock)

    renderChats()
    await screen.findByText('Bob')
    dispatchMessage(incoming('c2', 'muted ping'))

    expect(useNotificationStore.getState().unread.c2).toBeUndefined()
    expect(document.title).toBe('ChatSphere')
    expect(screen.queryByRole('status')).toBeNull()
    expect(NotificationMock).not.toHaveBeenCalled()

    vi.setSystemTime(new Date(start.getTime() + HOUR + 60_000))
    dispatchMessage(incoming('c2', 'after the mute'))

    expect(useNotificationStore.getState().unread.c2).toBe(1)
    expect(document.title).toBe('(1) ChatSphere')
    expect(await screen.findByRole('status')).toBeInTheDocument()
  })

  it.fails('SOUND-101 / BUG-079: an incoming message plays a notification sound once the user has interacted', async () => {
    const play = vi.fn().mockResolvedValue(undefined)
    const AudioMock = vi.fn(function Audio() {
      this.play = play
      this.pause = vi.fn()
      this.currentTime = 0
      this.volume = 1
    })
    vi.stubGlobal('Audio', AudioMock)

    const user = userEvent.setup()
    renderChats()
    await screen.findByText('Alice')

    dispatchMessage(incoming('c2', 'before any interaction'))
    expect(play).not.toHaveBeenCalled()

    await user.click(screen.getByText('Alice'))
    dispatchMessage(incoming('c2', 'sound ping'))

    expect(play).toHaveBeenCalled()
  })

  it('SOUND-102: a disabled sound toggle keeps notifications silent', async () => {
    const play = vi.fn().mockResolvedValue(undefined)
    const AudioMock = vi.fn(function Audio() {
      this.play = play
      this.pause = vi.fn()
      this.currentTime = 0
      this.volume = 1
    })
    vi.stubGlobal('Audio', AudioMock)
    useNotificationStore.setState({ soundEnabled: false })

    const user = userEvent.setup()
    renderChats()
    await screen.findByText('Alice')
    await user.click(screen.getByText('Alice'))

    dispatchMessage(incoming('c2', 'silent ping'))

    expect(play).not.toHaveBeenCalled()
  })

  it.fails('PREVIEW-101 / BUG-081: turning previews off hides the message text from desktop notifications', async () => {
    useNotificationStore.setState({ desktopEnabled: true })
    useNotificationStore.setState({ previewEnabled: false })
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    const NotificationMock = vi.fn()
    vi.stubGlobal('Notification', NotificationMock)

    renderChats()
    await screen.findByText('Alice')
    dispatchMessage(incoming('c2', 'confidential text'))

    expect(NotificationMock).toHaveBeenCalledTimes(1)
    const [, options] = NotificationMock.mock.calls[0]
    expect(options.body).not.toContain('confidential text')
  })

  it.fails('FOCUS-101 / BUG-082: a visible but unfocused tab still raises a desktop notification', async () => {
    useNotificationStore.setState({ desktopEnabled: true })
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    const NotificationMock = vi.fn()
    vi.stubGlobal('Notification', NotificationMock)

    renderChats()
    await screen.findByText('Alice')
    dispatchMessage(incoming('c2', 'unfocused ping'))

    expect(NotificationMock).toHaveBeenCalledTimes(1)
  })

  it('PERM-101: notification permission is not requested when the chat screen mounts', async () => {
    const requestPermission = vi.fn().mockResolvedValue('default')
    vi.stubGlobal('Notification', { requestPermission, permission: 'default' })

    renderChats()
    await screen.findByText('Alice')

    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('FLOOD-101: 100 messages arriving at once keep the UI responsive with one toast', async () => {
    renderChats()
    await screen.findByText('Alice')

    const started = performance.now()
    act(() => {
      for (let index = 0; index < 100; index += 1) {
        window.dispatchEvent(
          new CustomEvent('ws-message', {
            detail: { type: 'message:new', message: incoming('c2', `flood ${index}`) },
          }),
        )
      }
    })
    const elapsed = performance.now() - started

    expect(useNotificationStore.getState().unread.c2).toBe(100)
    expect(document.title).toBe('(100) ChatSphere')
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1)
    expect(elapsed).toBeLessThan(3000)
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })
})
