import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import MessageList from './MessageList.jsx'

// Testing.md 6.4: a 10,000-message conversation must stay cheap because the list
// is virtualized (the DOM stays small). MessageList currently maps every message.

const conversation = {
  _id: 'perf-conversation',
  type: 'direct',
  participants: [{ user: 'me' }, { user: 'other' }],
}

function makeMessages(count) {
  const base = new Date('2026-01-15T12:00:00.000Z').getTime()
  return Array.from({ length: count }, (_, index) => ({
    _id: `perf-${index}`,
    conversation: conversation._id,
    sender: index % 2 === 0 ? 'other' : 'me',
    type: 'text',
    text: `performance message ${index}`,
    createdAt: new Date(base + index * 60_000).toISOString(),
  }))
}

function renderAndMeasure(count) {
  const messages = makeMessages(count)
  const startedAt = performance.now()
  const { container } = render(
    <MessageList messages={messages} conversation={conversation} meId="me" />,
  )
  const durationMs = Math.round(performance.now() - startedAt)
  const bubbles = container.querySelectorAll('[data-message-id]').length
  const nodes = container.querySelectorAll('*').length
  const measured = { count, durationMs, bubbles, nodes, nodesPerMessage: Math.round((nodes / count) * 10) / 10 }
  console.log(`[perf-unit] ${JSON.stringify(measured)}`)
  return measured
}

afterEach(cleanup)

describe('PERF-001 message-list virtualization', () => {
  it('renders a 30-message page with a small DOM', () => {
    const measured = renderAndMeasure(30)
    expect(measured.bubbles).toBe(30)
    expect(measured.nodes).toBeLessThan(500)
  }, 30_000)

  it.fails('PERF-001 / BUG-076: renders 10,000 messages without putting them all in the DOM', () => {
    const measured = renderAndMeasure(10_000)
    expect(measured.nodes).toBeLessThan(500)
  }, 180_000)
})
