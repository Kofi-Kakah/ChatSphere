import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, FileText, Pause, Play, X } from 'lucide-react'
import { useMediaUrl } from '../../lib/media.js'

let playingAudio = null

function formatClock(seconds) {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ImageAttachment({ attachment, onOpen }) {
  const remote = useMediaUrl(attachment.previewUrl ? null : attachment.upload)
  const src = attachment.previewUrl || remote
  return (
    <button type="button" onClick={onOpen} className="block max-w-full" aria-label={`Open ${attachment.originalName || 'image'}`}>
      <img
        src={src || undefined}
        alt={attachment.originalName || 'Shared image'}
        width={attachment.width || undefined}
        height={attachment.height || undefined}
        loading="lazy"
        className="max-h-[320px] max-w-full rounded-[12px] object-cover"
      />
    </button>
  )
}

export function FileAttachment({ attachment }) {
  const remote = useMediaUrl(attachment.previewUrl ? null : attachment.upload)
  const src = attachment.previewUrl || remote
  const name = attachment.originalName || 'file'
  return (
    <div className="flex min-w-[220px] items-center gap-3 py-1">
      <span className="rounded-[10px] bg-black/10 p-2">
        <FileText size={20} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="text-xs opacity-70">{formatBytes(attachment.size)}</div>
      </div>
      <a
        href={src || '#'}
        download={name}
        aria-label={`Download ${name}`}
        className="rounded-[10px] p-2 hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-[var(--link-and-focus)]"
      >
        <Download size={20} strokeWidth={1.5} aria-hidden="true" />
      </a>
    </div>
  )
}

export function AudioAttachment({ attachment }) {
  const remote = useMediaUrl(attachment.previewUrl ? null : attachment.upload)
  const src = attachment.previewUrl || remote
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(attachment.duration || 0)
  const [rate, setRate] = useState(1)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return undefined
    const onTime = () => setCurrentTime(audio.currentTime)
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration)
    }
    const onEnd = () => { setPlaying(false); setCurrentTime(0) }
    const onPause = () => setPlaying(false)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnd)
    audio.addEventListener('pause', onPause)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnd)
      audio.removeEventListener('pause', onPause)
    }
  }, [])

  async function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      return
    }
    if (playingAudio && playingAudio !== audio) playingAudio.pause()
    playingAudio = audio
    try {
      await audio.play()
      setPlaying(true)
    } catch {
      setPlaying(false)
    }
  }

  function seek(event) {
    const audio = audioRef.current
    const value = Number(event.target.value)
    if (audio) audio.currentTime = value
    setCurrentTime(value)
  }

  function setSpeed(value) {
    const audio = audioRef.current
    if (audio) audio.playbackRate = value
    setRate(value)
  }

  return (
    <div className="flex min-w-[240px] items-center gap-2 py-1">
      <audio ref={audioRef} src={src || undefined} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className="rounded-full bg-black/10 p-2 focus:outline-none focus:ring-2 focus:ring-[var(--link-and-focus)]"
      >
        {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <input
          type="range"
          aria-label="Seek"
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          onChange={seek}
          className="w-full accent-[var(--primary)]"
        />
        <div className="flex items-center justify-between text-[11px] opacity-80">
          <span>{formatClock(currentTime || duration)}</span>
          <span className="flex gap-1">
            {[1, 1.5, 2].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSpeed(value)}
                aria-pressed={rate === value}
                className={`rounded px-1 ${rate === value ? 'font-semibold' : ''}`}
              >
                {value === 1 ? '1×' : `${value}×`}
              </button>
            ))}
          </span>
        </div>
      </div>
    </div>
  )
}

export function Lightbox({ images, index, onClose, onChange }) {
  const current = images[index]
  const remote = useMediaUrl(current?.upload)
  const src = current?.previewUrl || remote
  const name = current?.originalName || 'image'

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight' && index < images.length - 1) onChange(index + 1)
      if (event.key === 'ArrowLeft' && index > 0) onChange(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, images.length, onClose, onChange])

  if (!current) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close image viewer"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white focus:outline-none focus:ring-2 focus:ring-white"
      >
        <X size={20} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onChange(index - 1)}
        disabled={index <= 0}
        aria-label="Previous image"
        className="absolute left-4 rounded-full bg-white/10 p-3 text-white disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-white"
      >
        <ChevronLeft size={24} aria-hidden="true" />
      </button>
      <img src={src || undefined} alt={name} className="max-h-[85vh] max-w-[85vw] rounded-[14px] object-contain" />
      <button
        type="button"
        onClick={() => onChange(index + 1)}
        disabled={index >= images.length - 1}
        aria-label="Next image"
        className="absolute right-4 rounded-full bg-white/10 p-3 text-white disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-white"
      >
        <ChevronRight size={24} aria-hidden="true" />
      </button>
      <a
        href={src || '#'}
        download={name}
        aria-label={`Download ${name}`}
        className="absolute bottom-4 flex items-center gap-2 rounded-[10px] bg-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white"
      >
        <Download size={18} aria-hidden="true" />
        Download
      </a>
    </div>
  )
}
