import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useMediaUrl } from '../../lib/media.js'
import { AudioAttachment, Lightbox } from './MediaBubbles.jsx'

const TABS = ['Photos', 'Files', 'Audio']
const QUERY = { Photos: 'image', Files: 'file', Audio: 'audio' }

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function PhotoTile({ item, onOpen }) {
  const url = useMediaUrl(item.uploadId)
  return (
    <button type="button" onClick={onOpen} className="h-20 w-20 overflow-hidden rounded-[10px] border border-[var(--border)]">
      <img src={url || undefined} alt={item.originalName || 'Shared photo'} className="h-full w-full object-cover" />
    </button>
  )
}

function FileRow({ item }) {
  const url = useMediaUrl(item.uploadId)
  return (
    <li className="flex items-center gap-2 rounded-[10px] border border-[var(--border)] px-2 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-[var(--text)]">{item.originalName || 'file'}</div>
        <div className="text-xs text-[var(--text-muted)]">{formatBytes(item.size)}</div>
      </div>
      <a
        href={url || '#'}
        download={item.originalName || 'file'}
        aria-label={`Download ${item.originalName || 'file'}`}
        className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <Download size={18} aria-hidden="true" />
      </a>
    </li>
  )
}

export default function MediaPanel({ conversation }) {
  const [tab, setTab] = useState('Photos')
  const [result, setResult] = useState({ key: null, items: [] })
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const conversationId = conversation?._id
  const key = conversationId ? `${conversationId}:${tab}` : null

  useEffect(() => {
    if (!conversationId) return undefined
    let cancelled = false
    api(`/conversations/${conversationId}/media?type=${QUERY[tab]}`)
      .then((data) => { if (!cancelled) setResult({ key, items: data.media || [] }) })
      .catch(() => { if (!cancelled) setResult({ key, items: [] }) })
    return () => { cancelled = true }
  }, [conversationId, tab, key])

  const items = key && result.key === key ? result.items : []
  const photos = items.map((item) => ({ ...item, upload: item.uploadId }))

  return (
    <div className="flex h-full w-full flex-col">
      <div className="border-b border-[var(--border)] p-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">Shared media</h2>
      </div>
      <div role="tablist" aria-label="Shared media" className="flex gap-1 border-b border-[var(--border)] px-2 py-2">
        {TABS.map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            onClick={() => { setTab(name); setLightboxIndex(null) }}
            className={`rounded-[10px] px-3 py-1.5 text-sm ${
              tab === name
                ? 'bg-[var(--primary-soft)] font-medium text-[var(--primary)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-3">
        {!items.length && (
          <p className="text-sm text-[var(--text-muted)]">
            {tab === 'Photos' ? 'No photos shared yet.' : tab === 'Files' ? 'No files shared yet.' : 'No audio shared yet.'}
          </p>
        )}
        {tab === 'Photos' && (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((item, index) => (
              <PhotoTile key={`${item.uploadId}-${index}`} item={item} onOpen={() => setLightboxIndex(index)} />
            ))}
          </div>
        )}
        {tab === 'Files' && (
          <ul className="space-y-2">
            {items.map((item, index) => <FileRow key={`${item.uploadId}-${index}`} item={item} />)}
          </ul>
        )}
        {tab === 'Audio' && (
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li key={`${item.uploadId}-${index}`} className="rounded-[10px] border border-[var(--border)] px-2 py-1">
                <AudioAttachment
                  attachment={{
                    upload: item.uploadId,
                    mimeType: item.mimeType,
                    originalName: item.originalName,
                    duration: item.duration,
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      {lightboxIndex !== null && result.key === key && photos[lightboxIndex] && (
        <Lightbox
          images={photos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={setLightboxIndex}
        />
      )}
    </div>
  )
}
