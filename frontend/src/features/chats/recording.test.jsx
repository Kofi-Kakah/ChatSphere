import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Chats from './Chats.jsx'
import { api, uploadFile } from '../../lib/api.js'
import { toast } from '../../components/ui/Toast.jsx'
import { useAuthStore } from '../../store/auth.js'
import { useNotificationStore } from '../../store/notifications.js'

vi.mock('../../lib/api.js', () => ({ api: vi.fn(), uploadFile: vi.fn() }))
vi.mock('../../components/ui/Toast.jsx', () => ({ toast: vi.fn(), default: () => null }))

const conversations = [
  { _id: 'c1', type: 'direct', name: 'Alice', participants: [{ user: 'me' }, { user: 'u2' }] },
]

class FakeMediaRecorder {
  static isTypeSupported(type) {
    return type === 'audio/webm;codecs=opus' || type === 'audio/webm'
  }

  constructor(stream, options) {
    this.stream = stream
    this.mimeType = options?.mimeType || 'audio/webm'
    FakeMediaRecorder.last = this
  }

  start() {
    this.started = true
  }

  stop() {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: this.mimeType })
    this.ondataavailable?.({ data: blob })
    this.onstop?.()
  }
}

let trackStop

function installRecorder() {
  trackStop = vi.fn()
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] }) },
  })
  window.MediaRecorder = FakeMediaRecorder
  delete window.AudioContext
  delete window.webkitAudioContext
}

async function openChat() {
  fireEvent.click(await screen.findByText('Alice'))
  await waitFor(() => expect(screen.getAllByText('Alice').length).toBeGreaterThan(1))
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:voice')
  URL.revokeObjectURL = vi.fn()
  uploadFile.mockReset()
  toast.mockReset()
  api.mockImplementation((path) => {
    if (path === '/conversations') return Promise.resolve({ conversations })
    if (path.endsWith('/messages')) return Promise.resolve({ messages: [] })
    if (path.includes('/media')) return Promise.resolve({ media: [] })
    return Promise.resolve({})
  })
  useNotificationStore.setState({ unread: {}, totalUnread: 0, soundEnabled: true, desktopEnabled: false })
  useAuthStore.setState({ user: { _id: 'me' }, accessToken: 'token' })
  window.__socket = { connected: true, emit: vi.fn() }
  installRecorder()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('voice recording (5.11)', () => {
  it('records, shows the elapsed timer, uploads, and sends an audio message', async () => {
    uploadFile.mockResolvedValue({
      uploadId: 'voice1',
      mimeType: 'audio/webm',
      duration: 2,
    })
    render(<Chats />)
    await openChat()

    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Record voice message' }))
    await act(async () => {})

    expect(FakeMediaRecorder.last.started).toBe(true)
    expect(screen.getByRole('timer')).toHaveTextContent('0:00')

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByRole('timer')).toHaveTextContent('0:02')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })

    expect(uploadFile).toHaveBeenCalledTimes(1)
    const uploaded = uploadFile.mock.calls[0][0]
    expect(uploaded).toBeInstanceOf(File)
    expect(uploaded.name).toMatch(/^voice-\d+\.webm$/)
    expect(uploaded.type).toBe('audio/webm;codecs=opus')
    expect(trackStop).toHaveBeenCalled()

    const sent = window.__socket.emit.mock.calls.find(([name]) => name === 'message:send')
    expect(sent).toBeDefined()
    const [event, payload] = sent
    expect(event).toBe('message:send')
    expect(payload).toMatchObject({ conversationId: 'c1', type: 'audio', uploadIds: ['voice1'] })
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('rejects a recording shorter than one second without uploading', async () => {
    render(<Chats />)
    await openChat()

    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Record voice message' }))
    await act(async () => {})
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })

    expect(toast).toHaveBeenCalledWith('Recording is too short')
    expect(uploadFile).not.toHaveBeenCalled()
    expect(window.__socket.emit).not.toHaveBeenCalled()
    expect(trackStop).toHaveBeenCalled()
  })

  it('reports denied microphone permission', async () => {
    navigator.mediaDevices.getUserMedia.mockRejectedValue(new Error('denied'))
    render(<Chats />)
    await openChat()

    fireEvent.click(screen.getByRole('button', { name: 'Record voice message' }))
    await act(async () => {})

    expect(toast).toHaveBeenCalledWith('Microphone permission was denied')
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('reports unsupported browsers before touching the microphone', async () => {
    window.MediaRecorder = undefined
    render(<Chats />)
    await openChat()

    fireEvent.click(screen.getByRole('button', { name: 'Record voice message' }))
    await act(async () => {})

    expect(toast).toHaveBeenCalledWith('Voice recording is not supported in this browser')
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
  })
})
