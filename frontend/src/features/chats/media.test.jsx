import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MessageList from './MessageList.jsx'

const conversation = {
  _id: 'c1',
  type: 'direct',
  participants: [{ user: 'me' }, { user: 'u2' }],
}

const base = {
  _id: 'm1',
  conversation: 'c1',
  sender: { _id: 'u2', displayName: 'Bob' },
  createdAt: new Date().toISOString(),
}

function renderMessage(message) {
  return render(<MessageList messages={[message]} conversation={conversation} meId="me" />)
}

describe('MessageList media rendering (5.10, 5.11)', () => {
  it('BUG-059 (FILE-022): an image attachment renders with reserved width and height', () => {
    const { container } = renderMessage({
      ...base,
      type: 'image',
      text: '',
      attachments: [{ upload: 'u1', mimeType: 'image/png', originalName: 'photo.png', width: 120, height: 80 }],
    })

    const image = container.querySelector('img')
    expect(image, 'image element for the attachment').not.toBeNull()
    expect(image.getAttribute('width')).toBe('120')
    expect(image.getAttribute('height')).toBe('80')
  })

  it('BUG-059 (FILE-019): clicking an image opens a lightbox with next, previous, and download', () => {
    const { container } = renderMessage({
      ...base,
      type: 'image',
      text: '',
      attachments: [{ upload: 'u1', mimeType: 'image/png', originalName: 'photo.png', width: 120, height: 80 }],
    })

    const image = container.querySelector('img')
    expect(image, 'image element for the attachment').not.toBeNull()
    fireEvent.click(image)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('button', { name: /next/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /previous/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /download/i })).toBeTruthy()
  })

  it('BUG-059 (FILE-022): a file attachment renders a card with its name and a download action', () => {
    renderMessage({
      ...base,
      type: 'file',
      text: '',
      attachments: [{ upload: 'u2', mimeType: 'application/pdf', originalName: 'report.pdf', size: 2048 }],
    })

    expect(screen.getByText('report.pdf')).toBeTruthy()
    expect(screen.getByRole('link', { name: /download/i })).toBeTruthy()
  })

  it('BUG-060 (AUD-008): an audio attachment renders a player with play, seek, and speed controls', () => {
    renderMessage({
      ...base,
      type: 'audio',
      text: '',
      attachments: [{ upload: 'u3', mimeType: 'audio/mpeg', originalName: 'voice.mp3', size: 2048, duration: 42 }],
    })

    expect(screen.getByRole('button', { name: /play/i })).toBeTruthy()
    expect(screen.getByRole('slider', { name: /seek|progress/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: '1.5×' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '2×' })).toBeTruthy()
    expect(screen.getByText('0:42')).toBeTruthy()
  })
})
