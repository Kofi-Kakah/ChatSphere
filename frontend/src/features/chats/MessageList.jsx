import { Fragment, useState } from 'react'
import { Check, CheckCheck } from 'lucide-react'
import { AudioAttachment, FileAttachment, ImageAttachment, Lightbox } from './MediaBubbles.jsx'
import {
  formatDayLabel,
  formatFullDateTime,
  formatTime,
  isSameLocalDay,
  isWithinMinutes,
} from '../../lib/dates.js'

const SENDER_COLORS = ['var(--sender-1)', 'var(--sender-2)', 'var(--sender-3)', 'var(--sender-4)']

function senderIdOf(message) {
  return message.sender && typeof message.sender === 'object' ? message.sender._id : message.sender
}

function senderNameOf(message) {
  if (!message.sender || typeof message.sender !== 'object') return ''
  return message.sender.displayName || message.sender.username || ''
}

function colorFor(id) {
  let hash = 0
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return SENDER_COLORS[hash % SENDER_COLORS.length]
}

function isOwnMessage(message, meId) {
  if (message.pending) return true
  if (!meId) return false
  return String(senderIdOf(message)) === String(meId)
}

function tickState(message, conversation, meId) {
  if (!isOwnMessage(message, meId) || message.pending || message.type === 'system') return null
  const others = (conversation?.participants || []).filter(
    (participant) => String(participant.user?._id ?? participant.user) !== String(meId),
  )
  if (!others.length) return 'sent'
  const reached = (pointer) => pointer && String(pointer) >= String(message._id)
  if (others.every((participant) => reached(participant.lastReadMessage))) return 'read'
  if (others.every((participant) => reached(participant.lastDeliveredMessage))) return 'delivered'
  return 'sent'
}

function Tick({ state }) {
  if (!state) return null
  const Icon = state === 'sent' ? Check : CheckCheck
  const label = state === 'sent' ? 'Sent' : state === 'delivered' ? 'Delivered' : 'Read'
  return (
    <span
      role="img"
      aria-label={label}
      className={state === 'read' ? 'text-[var(--tick-read)]' : 'text-[var(--tick-sent)]'}
    >
      <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
    </span>
  )
}

function Attachment({ attachment, onOpen }) {
  const mime = attachment.mimeType || ''
  if (mime.startsWith('image/')) return <ImageAttachment attachment={attachment} onOpen={onOpen} />
  if (mime.startsWith('audio/')) return <AudioAttachment attachment={attachment} />
  return <FileAttachment attachment={attachment} />
}

export default function MessageList({ messages, conversation, meId }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const images = []
  for (const message of messages) {
    for (const attachment of message.attachments || []) {
      if ((attachment.mimeType || '').startsWith('image/')) images.push(attachment)
    }
  }

  return (
    <div className="p-4">
      {messages.map((message, index) => {
        const previous = messages[index - 1]
        const next = messages[index + 1]
        const firstOfDay = !previous || !isSameLocalDay(previous.createdAt, message.createdAt)
        const own = isOwnMessage(message, meId)
        const sameSenderAsPrevious = previous && senderIdOf(previous) === senderIdOf(message)
        const groupedWithPrevious =
          firstOfDay ? false : sameSenderAsPrevious && isWithinMinutes(previous.createdAt, message.createdAt, 5)
        const sameSenderAsNext = next && senderIdOf(next) === senderIdOf(message)
        const groupedWithNext =
          !next || !isSameLocalDay(message.createdAt, next.createdAt)
            ? false
            : sameSenderAsNext && isWithinMinutes(message.createdAt, next.createdAt, 5)
        const senderName = senderNameOf(message)
        const showSender = conversation?.type === 'group' && !own && !groupedWithPrevious && senderName
        const label = firstOfDay ? formatDayLabel(message.createdAt) : null
        const radius = groupedWithNext
          ? { [own ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: 6 }
          : undefined
        const attachments = message.attachments || []

        return (
          <Fragment key={message._id}>
            {label && (
              <div role="separator" aria-label={label} className="my-4 flex justify-center">
                <span className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
                  {label}
                </span>
              </div>
            )}
            <div
              data-message-id={message._id}
              data-grouped={groupedWithPrevious ? 'true' : 'false'}
              title={formatFullDateTime(message.createdAt)}
              className={`flex w-fit min-w-0 max-w-[60%] flex-col ${own ? 'ml-auto items-end' : 'items-start'} ${
                groupedWithPrevious ? 'mt-1' : 'mt-3'
              }`}
            >
              {showSender && (
                <div
                  data-sender-name={senderName}
                  className="mb-0.5 px-1 text-xs font-medium"
                  style={{ color: colorFor(senderIdOf(message)) }}
                >
                  {senderName}
                </div>
              )}
              {(message.text || attachments.length > 0) && (
                <div
                  className={`min-w-0 max-w-full rounded-[16px] px-2 py-2 text-[15px] ${
                    own
                      ? 'bg-[var(--bubble-out)] text-[var(--bubble-out-text)]'
                      : 'border border-[var(--border)] bg-[var(--bubble-in)] text-[var(--bubble-in-text)]'
                  }`}
                  style={radius}
                >
                  {attachments.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {attachments.map((attachment, attachmentIndex) => (
                        <Attachment
                          key={`${message._id}-${attachmentIndex}`}
                          attachment={attachment}
                          onOpen={() => {
                            const found = images.indexOf(attachment)
                            setLightboxIndex(found === -1 ? 0 : found)
                          }}
                        />
                      ))}
                    </div>
                  )}
                  {message.text && <div className={`[overflow-wrap:anywhere] px-2 ${attachments.length ? 'mt-1' : ''}`}>{message.text}</div>}
                </div>
              )}
              <div
                className={`mt-1 flex items-center gap-1 px-1 text-[11px] ${
                  own ? 'justify-end text-[var(--tick-sent)]' : 'text-[var(--text-muted)]'
                }`}
              >
                <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                <Tick state={tickState(message, conversation, meId)} />
              </div>
            </div>
          </Fragment>
        )
      })}
      {lightboxIndex !== null && images[lightboxIndex] && (
        <Lightbox
          images={images}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={setLightboxIndex}
        />
      )}
    </div>
  )
}
