import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import { isSocketOpen } from '../../lib/socket.js'
import Avatar from '../../components/ui/Avatar.jsx'
import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'

export default function Chats() {
  const [conversations, setConversations] = useState([])
  const [active, setActive] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')

  useEffect(() => {
    api('/conversations').then((d) => setConversations(d.conversations || []))
  }, [])

  useEffect(() => {
    const handler = (e) => {
      const m = e.detail
      if (m?.type === 'message:new' && m.message?.conversation === active?._id) {
        setMessages((prev) => [...prev, m.message])
      }
    }
    window.addEventListener('ws-message', handler)
    return () => window.removeEventListener('ws-message', handler)
  }, [active])

  // socket message dispatch
  useEffect(() => {
    const { connectSocket } = require?.('../../lib/socket.js') || {}
  }, [])

  async function openConv(c) {
    setActive(c)
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
    const ws = window.__ws
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'message:send', conversationId: active._id, clientId, type: 'text', text }))
    }
    setText('')
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
        <div className="border-t border-[var(--border)] bg-[var(--surface)] p-3 flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" onKeyDown={(e) => { if (e.key === 'Enter') send() }} />
          <Button onClick={send}>Send</Button>
        </div>
      </main>
    </div>
  )
}
