import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Chats from './Chats.jsx'
import { api, uploadFile } from '../../lib/api.js'
import { useAuthStore } from '../../store/auth.js'
import { useNotificationStore } from '../../store/notifications.js'

vi.mock('../../lib/api.js', () => ({ api: vi.fn(), uploadFile: vi.fn() }))

const conversations = [
  { _id: 'c1', type: 'direct', name: 'Alice', participants: [{ user: 'me' }, { user: 'u2' }] },
]

function photo() {
  return new File([new Uint8Array([137, 80, 78, 71])], 'photo.png', { type: 'image/png' })
}

async function openChat(user) {
  await user.click(await screen.findByText('Alice'))
  await waitFor(() => expect(screen.getAllByText('Alice').length).toBeGreaterThan(1))
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
  uploadFile.mockReset()
  api.mockImplementation((path) => {
    if (path === '/conversations') return Promise.resolve({ conversations })
    if (path.endsWith('/messages')) return Promise.resolve({ messages: [] })
    if (path.includes('/media')) return Promise.resolve({ media: [] })
    return Promise.resolve({})
  })
  useNotificationStore.setState({ unread: {}, totalUnread: 0, soundEnabled: true, desktopEnabled: false })
  useAuthStore.setState({ user: { _id: 'me' }, accessToken: 'token' })
  window.__socket = { connected: true, emit: vi.fn() }
})

describe('attachment composer (5.10)', () => {
  it('uploads a chosen photo, shows progress, and sends its upload id', async () => {
    let captured
    uploadFile.mockImplementation((file, options) => new Promise((resolve) => {
      captured = { file, options, resolve }
    }))
    const user = userEvent.setup()
    render(<Chats />)
    await openChat(user)

    await user.upload(document.querySelector('input[type="file"]'), photo())
    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1))
    expect(captured.file.name).toBe('photo.png')

    act(() => captured.options.onProgress(0.5))
    expect(await screen.findByRole('progressbar', { name: /uploading photo\.png/i })).toHaveAttribute(
      'aria-valuenow',
      '50',
    )

    await act(async () => {
      captured.resolve({ uploadId: 'up1', mimeType: 'image/png', width: 120, height: 80 })
    })
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull())

    await user.click(screen.getByRole('button', { name: 'Send' }))

    const [event, payload] = window.__socket.emit.mock.calls[0]
    expect(event).toBe('message:send')
    expect(payload).toMatchObject({ conversationId: 'c1', type: 'image', uploadIds: ['up1'] })
    const bubbleImage = document.querySelector('[data-message-id] img')
    expect(bubbleImage).not.toBeNull()
    expect(bubbleImage.getAttribute('width')).toBe('120')
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:preview')
  })

  it('aborts an upload when its cancel control is used', async () => {
    let captured
    uploadFile.mockImplementation((file, options) => new Promise(() => { captured = { file, options } }))
    const user = userEvent.setup()
    render(<Chats />)
    await openChat(user)

    await user.upload(document.querySelector('input[type="file"]'), photo())
    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: /cancel upload for photo\.png/i }))

    expect(captured.options.signal.aborted).toBe(true)
    expect(screen.queryByText('photo.png')).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  })

  it('starts an upload when an image is pasted into the composer', async () => {
    uploadFile.mockResolvedValue({ uploadId: 'up2', mimeType: 'image/png', width: 120, height: 80 })
    const user = userEvent.setup()
    render(<Chats />)
    await openChat(user)

    fireEvent.paste(screen.getByPlaceholderText('Type a message'), { clipboardData: { files: [photo()] } })

    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1))
    expect(uploadFile.mock.calls[0][0].name).toBe('photo.png')
  })

  it('ignores a whitespace-only send while an upload is still in progress', async () => {
    uploadFile.mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    render(<Chats />)
    await openChat(user)
    await user.upload(document.querySelector('input[type="file"]'), photo())
    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(window.__socket.emit).not.toHaveBeenCalled()
  })
})
