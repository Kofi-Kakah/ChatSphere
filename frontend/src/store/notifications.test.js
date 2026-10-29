import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationStore } from './notifications.js'

const initial = { unread: {}, totalUnread: 0, soundEnabled: true, desktopEnabled: false }

beforeEach(() => {
  localStorage.clear()
  useNotificationStore.setState(initial)
  document.title = 'ChatSphere'
})

describe('notification store', () => {
  it('tracks per-conversation unread counts and a total', () => {
    const { incrementUnread, setUnread } = useNotificationStore.getState()

    incrementUnread('c1')
    incrementUnread('c1')
    setUnread('c2', 3)

    expect(useNotificationStore.getState().unread).toEqual({ c1: 2, c2: 3 })
    expect(useNotificationStore.getState().totalUnread).toBe(5)
  })

  it('updates the tab title and removes the count when everything is read', () => {
    const { incrementUnread, clearUnread } = useNotificationStore.getState()

    incrementUnread('c1')
    incrementUnread('c2')
    expect(document.title).toBe('(2) ChatSphere')

    clearUnread('c1')
    expect(document.title).toBe('(1) ChatSphere')

    clearUnread('c2')
    expect(document.title).toBe('ChatSphere')
    expect(useNotificationStore.getState().totalUnread).toBe(0)
  })

  it('persists the sound and desktop toggles', () => {
    useNotificationStore.getState().setSound(false)
    useNotificationStore.getState().setDesktop(true)

    const stored = JSON.parse(localStorage.getItem('chatsphere-notifications'))
    expect(stored.state.soundEnabled).toBe(false)
    expect(stored.state.desktopEnabled).toBe(true)
  })

  it('enables desktop notifications when permission is granted', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', { requestPermission })

    await useNotificationStore.getState().requestDesktopPermission()

    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(useNotificationStore.getState().desktopEnabled).toBe(true)
  })

  it('keeps desktop notifications off when permission is denied', async () => {
    useNotificationStore.setState({ desktopEnabled: true })
    vi.stubGlobal('Notification', { requestPermission: vi.fn().mockResolvedValue('denied') })

    await useNotificationStore.getState().requestDesktopPermission()

    expect(useNotificationStore.getState().desktopEnabled).toBe(false)
  })

  it('keeps desktop notifications off when the user dismisses the prompt', async () => {
    useNotificationStore.setState({ desktopEnabled: true })
    vi.stubGlobal('Notification', { requestPermission: vi.fn().mockResolvedValue('default') })

    await useNotificationStore.getState().requestDesktopPermission()

    expect(useNotificationStore.getState().desktopEnabled).toBe(false)
  })

  it('is a no-op when the browser exposes no Notification API', async () => {
    useNotificationStore.setState({ desktopEnabled: true })
    vi.stubGlobal('Notification', undefined)
    Reflect.deleteProperty(window, 'Notification')

    await expect(useNotificationStore.getState().requestDesktopPermission()).resolves.toBeUndefined()

    expect(useNotificationStore.getState().desktopEnabled).toBe(true)
    vi.unstubAllGlobals()
  })

  it.fails('BUG-038 / NOTIF-001: restores the unread state and tab title after a reload', async () => {
    localStorage.setItem(
      'chatsphere-notifications',
      JSON.stringify({
        state: { unread: { c1: 2 }, totalUnread: 2, soundEnabled: true, desktopEnabled: false },
        version: 0,
      }),
    )
    document.title = 'ChatSphere'
    vi.resetModules()

    const { useNotificationStore: reloaded } = await import('./notifications.js')

    expect(reloaded.getState().unread).toEqual({ c1: 2 })
    expect(document.title).toBe('(2) ChatSphere')
  })
})
