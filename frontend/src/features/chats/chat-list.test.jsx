import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Chats from './Chats.jsx'
import { api } from '../../lib/api.js'

vi.mock('../../lib/api.js', () => ({ api: vi.fn() }))

beforeEach(() => {
  api.mockImplementation((path) => {
    if (path === '/conversations') {
      return Promise.resolve({
        conversations: [{ _id: 'c1', name: 'Alice', lastMessage: { text: 'hi' } }],
      })
    }
    return Promise.resolve({ messages: [] })
  })
})

describe('conversation list', () => {
  it('CHAT-020: renders a row for every conversation', async () => {
    render(<Chats />)

    expect(await screen.findByText('Alice')).toBeInTheDocument()
  })
})
