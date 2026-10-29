import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, Mic, Paperclip, X } from 'lucide-react'
import { api, uploadFile } from '../../lib/api.js'
import { useNotificationStore } from '../../store/notifications.js'
import { toast } from '../../components/ui/Toast.jsx'
import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'
import Avatar from '../../components/ui/Avatar.jsx'
import MessageList from './MessageList.jsx'
import MediaPanel from './MediaPanel.jsx'
import { useAuthStore } from '../../store/auth.js'

const EmojiPicker = lazy(() => import('emoji-picker-react'))

const MB = 1024 * 1024
const MAX_RECORDING_SECONDS = 300

function nowMs() {
  return Date.now()
}

function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export default function Chats() {
  const meId = useAuthStore((state) => state.user?._id)
  const [conversations, setConversations] = useState([])
  const [active, setActive] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [showInfo, setShowInfo] = useState(true)
  const [attachments, setAttachments] = useState([])
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [recordLevel, setRecordLevel] = useState(0)
  const textareaRef = useRef(null)
  const imageInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const attachmentsRef = useRef(attachments)
  const sentPreviewUrlsRef = useRef([])
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const rafRef = useRef(null)
  const audioCtxRef = useRef(null)
  const startedAtRef = useRef(0)
  const discardRef = useRef(false)

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

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
    if (!active) return undefined
    const draft = localStorage.getItem(`draft:${active._id}`) || ''
    setText(draft)
    setMessages([])
    let cancelled = false
    api(`/conversations/${active._id}/messages`).then((d) => {
      if (!cancelled) setMessages(d.messages || [])
    })
    return () => { cancelled = true }
  }, [active])

  useEffect(() => {
    if (active) localStorage.setItem(`draft:${active._id}`, text)
  }, [text, active])

  useEffect(() => () => {
    clearInterval(timerRef.current)
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    audioCtxRef.current?.close?.()
    for (const item of attachmentsRef.current) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    }
    for (const url of sentPreviewUrlsRef.current) URL.revokeObjectURL(url)
  }, [])

  function updateAttachment(key, patch) {
    setAttachments((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  function removeAttachment(key, { abort = true } = {}) {
    const item = attachmentsRef.current.find((entry) => entry.key === key)
    if (item) {
      if (abort) item.controller?.abort()
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    }
    setAttachments((prev) => prev.filter((entry) => entry.key !== key))
  }

  function resetAttachments() {
    for (const item of attachmentsRef.current) {
      item.controller?.abort()
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    }
    setAttachments([])
    setShowAttach(false)
  }

  function buildItem(file) {
    const isImage = file.type.startsWith('image/')
    const isAudio = file.type.startsWith('audio/')
    const limit = isImage ? 10 * MB : isAudio ? 20 * MB : 25 * MB
    if (file.size > limit) {
      toast(`${file.name} is too large`)
      return null
    }
    return {
      key: crypto.randomUUID(),
      file,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      progress: 0,
      status: 'uploading',
      previewUrl: isImage ? URL.createObjectURL(file) : null,
      controller: new AbortController(),
    }
  }

  async function uploadOne(item) {
    try {
      const data = await uploadFile(item.file, {
        signal: item.controller.signal,
        onProgress: (progress) => updateAttachment(item.key, { progress }),
      })
      const ready = {
        status: 'ready',
        progress: 1,
        uploadId: data.uploadId,
        mimeType: data.mimeType,
        width: data.width,
        height: data.height,
        duration: data.duration,
      }
      updateAttachment(item.key, ready)
      return { ...item, ...ready }
    } catch (error) {
      if (error?.name === 'AbortError') {
        removeAttachment(item.key, { abort: false })
        return null
      }
      updateAttachment(item.key, { status: 'failed', error: error?.message || 'Upload failed' })
      return null
    }
  }

  function addFiles(fileList) {
    if (!active) { toast('Select a chat first'); return }
    const items = Array.from(fileList || []).map(buildItem).filter(Boolean)
    if (!items.length) return
    setAttachments((prev) => [...prev, ...items])
    for (const item of items) uploadOne(item)
  }

  function openConv(c) {
    resetAttachments()
    setActive(c)
    useNotificationStore.getState().clearUnread(c._id)
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

  function dispatchMessage(messageText, ready) {
    const clientId = crypto.randomUUID()
    const type = ready.some((item) => item.mimeType?.startsWith('audio/'))
      ? 'audio'
      : ready.some((item) => item.mimeType?.startsWith('image/'))
        ? 'image'
        : ready.length ? 'file' : 'text'
    const optimistic = {
      _id: clientId,
      conversation: active._id,
      sender: 'me',
      type,
      text: messageText,
      attachments: ready.map((item) => ({
        upload: item.uploadId,
        mimeType: item.mimeType,
        size: item.size,
        originalName: item.name,
        width: item.width,
        height: item.height,
        duration: item.duration,
        previewUrl: item.previewUrl,
      })),
      createdAt: new Date().toISOString(),
      pending: true,
    }
    setMessages((prev) => [...prev, optimistic])
    const ws = window.__socket
    if (ws && ws.connected) {
      const payload = { conversationId: active._id, clientId, type, text: messageText }
      if (ready.length) payload.uploadIds = ready.map((item) => item.uploadId)
      ws.emit('message:send', payload, () => {})
    }
  }

  function send() {
    if (!active) { alert('Select or create a chat first'); return }
    if (attachments.some((item) => item.status === 'uploading')) {
      toast('Wait for uploads to finish')
      return
    }
    const ready = attachments.filter((item) => item.status === 'ready')
    if (!text.trim() && !ready.length) return
    dispatchMessage(text, ready)
    for (const item of ready) {
      if (item.previewUrl) sentPreviewUrlsRef.current.push(item.previewUrl)
    }
    setAttachments((prev) => prev.filter((item) => item.status !== 'ready'))
    setText('')
    localStorage.removeItem(`draft:${active._id}`)
  }

  function handlePaste(event) {
    const files = Array.from(event.clipboardData?.files || [])
    if (!files.length) return
    event.preventDefault()
    addFiles(files)
  }

  function handleDrop(event) {
    event.preventDefault()
    const files = Array.from(event.dataTransfer?.files || [])
    if (files.length) addFiles(files)
  }

  function stopRecorderResources() {
    clearInterval(timerRef.current)
    timerRef.current = null
    cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    try { audioCtxRef.current?.close?.() } catch { /* already closed */ }
    audioCtxRef.current = null
    recorderRef.current = null
  }

  async function finishRecording(mimeType) {
    const elapsed = nowMs() - startedAtRef.current
    const chunks = chunksRef.current
    chunksRef.current = []
    stopRecorderResources()
    setRecording(false)
    setRecordSeconds(0)
    setRecordLevel(0)
    if (discardRef.current) {
      discardRef.current = false
      return
    }
    if (elapsed < 1000) {
      toast('Recording is too short')
      return
    }
    const type = mimeType || chunks[0]?.type || 'audio/webm'
    const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
    const file = new File(chunks, `voice-${nowMs()}.${extension}`, { type })
    const item = buildItem(file)
    if (!item) return
    setAttachments((prev) => [...prev, item])
    const ready = await uploadOne(item)
    if (!ready) return
    dispatchMessage('', [ready])
    setAttachments((prev) => prev.filter((entry) => entry.key !== item.key))
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      toast('Voice recording is not supported in this browser')
      return
    }
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      toast('Microphone permission was denied')
      return
    }
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
    const mimeType = candidates.find((type) => window.MediaRecorder.isTypeSupported?.(type))
    let recorder
    try {
      recorder = mimeType ? new window.MediaRecorder(stream, { mimeType }) : new window.MediaRecorder(stream)
    } catch {
      stream.getTracks().forEach((track) => track.stop())
      toast('Voice recording is not supported in this browser')
      return
    }
    chunksRef.current = []
    discardRef.current = false
    recorder.ondataavailable = (event) => { if (event.data?.size) chunksRef.current.push(event.data) }
    recorder.onstop = () => finishRecording(recorder.mimeType)
    recorder.start()
    recorderRef.current = recorder
    streamRef.current = stream
    startedAtRef.current = nowMs()
    setRecordSeconds(0)
    setRecording(true)
    timerRef.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000)
      setRecordSeconds(seconds)
      if (seconds >= MAX_RECORDING_SECONDS) recorderRef.current?.stop()
    }, 250)

    const AudioCtor = window.AudioContext || window.webkitAudioContext
    if (AudioCtor) {
      try {
        const context = new AudioCtor()
        const analyser = context.createAnalyser()
        context.createMediaStreamSource(stream).connect(analyser)
        analyser.fftSize = 256
        const data = new Uint8Array(analyser.frequencyBinCount)
        audioCtxRef.current = context
        const tick = () => {
          analyser.getByteTimeDomainData(data)
          let peak = 0
          for (const value of data) peak = Math.max(peak, Math.abs(value - 128))
          setRecordLevel(Math.min(1, peak / 128))
          rafRef.current = requestAnimationFrame(tick)
        }
        tick()
      } catch { /* the level meter is optional */ }
    }
  }

  function stopRecording() {
    discardRef.current = false
    recorderRef.current?.stop()
  }

  function cancelRecording() {
    discardRef.current = true
    recorderRef.current?.stop()
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
        <header className="h-16 border-b border-[var(--border)] bg-[var(--surface)] flex items-center px-4 gap-2">
          <span className="font-semibold">{active ? (active.name || 'Chat') : 'Select a chat'}</span>
          {active && (
            <button
              type="button"
              onClick={() => setShowInfo((value) => !value)}
              aria-label="Chat info"
              aria-pressed={showInfo}
              className="ml-auto rounded-[10px] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
            >
              Info
            </button>
          )}
        </header>
        <div className="flex-1 overflow-auto">
          <MessageList messages={messages} conversation={active} meId={meId} />
        </div>
        <div
          className="border-t border-[var(--border)] bg-[var(--surface)] p-3"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((item) => (
                <div key={item.key} className="flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt="" className="h-9 w-9 rounded object-cover" />
                  ) : (
                    <span className="rounded bg-[var(--surface)] p-1"><Paperclip size={16} aria-hidden="true" /></span>
                  )}
                  <div className="min-w-0">
                    <div className="max-w-[160px] truncate text-xs text-[var(--text)]">{item.name}</div>
                    {item.status === 'uploading' && (
                      <div
                        role="progressbar"
                        aria-label={`Uploading ${item.name}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(item.progress * 100)}
                        className="mt-1 h-1 w-28 overflow-hidden rounded-full bg-[var(--border)]"
                      >
                        <div className="h-full bg-[var(--primary)]" style={{ width: `${Math.round(item.progress * 100)}%` }} />
                      </div>
                    )}
                    {item.status === 'failed' && <div className="text-[11px] text-[var(--danger)]">{item.error}</div>}
                  </div>
                  <button
                    type="button"
                    aria-label={item.status === 'uploading' ? `Cancel upload for ${item.name}` : `Remove ${item.name}`}
                    onClick={() => removeAttachment(item.key)}
                    className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {recording ? (
            <div className="flex items-center gap-3">
              <span role="timer" className="text-sm tabular-nums text-[var(--text)]">{formatClock(recordSeconds)}</span>
              <meter
                aria-label="Microphone level"
                min={0}
                max={1}
                value={recordLevel}
                className="h-2 flex-1"
              />
              <Button variant="secondary" onClick={cancelRecording}>Cancel</Button>
              <Button onClick={stopRecording}>Send</Button>
            </div>
          ) : (
            <div className="flex gap-2 items-end">
              <div className="relative">
                <button
                  type="button"
                  aria-label="Attach file"
                  aria-expanded={showAttach}
                  onClick={() => setShowAttach((value) => !value)}
                  className="px-2 py-2 text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  <Paperclip size={20} aria-hidden="true" />
                </button>
                {showAttach && (
                  <div role="menu" className="absolute bottom-full left-0 z-10 mb-2 w-36 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-1 shadow">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setShowAttach(false); imageInputRef.current?.click() }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--surface-2)]"
                    >
                      <ImageIcon size={16} aria-hidden="true" /> Photo
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setShowAttach(false); fileInputRef.current?.click() }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--surface-2)]"
                    >
                      <Paperclip size={16} aria-hidden="true" /> File
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                aria-label="Record voice message"
                onClick={startRecording}
                className="px-2 py-2 text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <Mic size={20} aria-hidden="true" />
              </button>
              <button onClick={() => setShowEmoji((v) => !v)} className="text-[var(--text-muted)] hover:text-[var(--text)] px-2 py-2">🙂</button>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => { setText(e.target.value); autoGrow(e) }}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
                }}
                placeholder="Type a message"
                rows={1}
                className="flex-1 resize-none rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--link-and-focus)]"
              />
              <Button onClick={send}>Send</Button>
            </div>
          )}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm"
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
          />
          {showEmoji && (
            <div className="mt-2">
              <Suspense fallback={<div className="text-sm text-[var(--text-muted)]">Loading…</div>}>
                <EmojiPicker onEmojiClick={onEmojiClick} theme="auto" />
              </Suspense>
            </div>
          )}
        </div>
      </main>
      {active && showInfo && (
        <aside className="hidden w-[320px] border-l border-[var(--border)] bg-[var(--surface)] lg:flex">
          <MediaPanel conversation={active} />
        </aside>
      )}
    </div>
  )
}
