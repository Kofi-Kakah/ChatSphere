import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api.js'
import { useNotificationStore } from '../../store/notifications.js'
import { toast } from '../../components/ui/Toast.jsx'
import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'

const EmojiPicker = lazy(() => import('emoji-picker-react'))

export default function Chats() {
  const [conversations, setConversations] = useState([])
  const [active, setActive] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    api('/conversations').then((d) => setConversations(d.conversations || []))
  }, [])

  useEffect(() => {
    const handler = (e) => {
      const m = e.detail
      if (m?.type === 'message:new') {
        if (m.message?.conversation === active?._id) {
          setMessages((prev) => [...prev, m.message])
        } else {
          useNotificationStore.getState().incrementUnread(m.message.conversation)
          toast('New message')
          if (useNotificationStore.getState().desktopEnabled && document.hidden && 'Notification' in window) {
            new Notification('New message', { body: m.message.text || 'Attachment' })
          }
        }
      }
    }
    window.addEventListener('ws-message', handler)
    return () => window.removeEventListener('ws-message', handler)
  }, [active])

  useEffect(() => {
    if (active) {
      const draft = localStorage.getItem(`draft:${active._id}`) || ''
      setText(draft)
      api(`/conversations/${active._id}/messages`).then((d) => setMessages(d.messages || []))
    }
  }, [active])

  useEffect(() => {
    if (active) localStorage.setItem(`draft:${active._id}`, text)
  }, [text, active])

  async function openConv(c) {
    setActive(c)
    useNotificationStore.getState().clearUnread(c._id)
    const d = await api(`/conversations/${c._id}/messages`)
    setMessages(d.messages || [])
  }

  async function startChat() {
    const username = prompt('Username to chat with:')
    if (!username) return
    const users = await api(`/users/search?q=${encodeURIComponent(username)}`)
    const u = users.users?.[0]
    if (!u) return alert('not found')
    const d = await api('/conversations/direct', { method: 'POST', body: JSON.stringify({ userId: u._id }) })
    const c = d.conversation
    setConversations((prev) => [c, ...prev])
    openConv(c)
  }

  function send() {
    if (!text.trim() || !active) return
    const clientId = crypto.randomUUID()
    const optimistic = { _id: clientId, conversation: active._id, sender: 'me', type: 'text', text, createdAt: new Date().toISOString(), pending: true }
    setMessages((prev) => [...prev, optimistic])
    const ws = window.__socket
    if (ws && ws.connected) {
      ws.emit('message:send', { conversationId: active._id, clientId, type: 'text', text }, (ack) => {})
    }
    setText('')
    localStorage.removeItem(`draft:${active._id}`)
  }

  function onEmojiClick(emojiData) {
    const ta = textareaRef.current
    if (!ta) { setText((t) => t + emojiData.emoji); return }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const next = text.slice(0, start) + emojiData.emoji + text.slice(end)
    setText(next)
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + emojiData.emoji.length
      ta.focus()
    })
  }

  function autoGrow(e) {
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
  }

  return (
    <div className="h-full flex">
      <aside className="w-[340px] border-r border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex gap-2 mb-3">
          <Input placeholder="Search" className="flex-1" />
          <Button onClick={startChat}>New</Button>
        </div>
        <div className="space-y-2">
          {conversations.map((c) => (
            <div key={c._id} onClick={() => openConv(c)} className="flex items-center gap-3 p-2 rounded-[10px] hover:bg-[var(--surface-2)] cursor-pointer">
              <Avatar name={c.name || 'Chat'} size={40} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.name || 'Direct chat'}</div>
                <div className="text-xs text-[var(--text-muted)] truncate">{c.lastMessage?.text}</div>
              </div>
            </div>
          ))}
        </div>
      </aside>
      <main className="flex-1 flex flex-col bg-[var(--bg)]">
        <header className="h-16 border-b border-[var(--border)] bg-[var(--surface)] flex items-center px-4">
          <span className="font-semibold">{active ? (active.name || 'Chat') : 'Select a chat'}</span>
        </header>
        <div className="flex-1 overflow-auto p-4 space-y-2">
          {messages.map((m) => (
            <div key={m._id} className={`max-w-[60%] rounded-[16px] px-4 py-2 text-[15px] ${m.sender === 'me' ? 'ml-auto bg-[var(--bubble-out)] text-white' : 'bg-[var(--bubble-in)] border border-[var(--border)]'}`}>
              {m.text}
            </div>
          ))}
        </div>
        <div className="border-t border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="flex gap-2 items-end">
            <button onClick={() => setShowEmoji((v) => !v)} className="text-[var(--text-muted)] hover:text-[var(--text)] px-2 py-2">🙂</button>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => { setText(e.target.value); autoGrow(e) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
              }}
              placeholder="Type a message"
              rows={1}
              className="flex-1 resize-none rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--link-and-focus)]"
            />
            <Button onClick={send}>Send</Button>
          </div>
          {showEmoji && (
            <div className="mt-2">
              <Suspense fallback={<div className="text-sm text-[var(--text-muted)]">Loading…</div>}>
                <EmojiPicker onEmojiClick={onEmojiClick} theme="auto" />
              </Suspense>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
