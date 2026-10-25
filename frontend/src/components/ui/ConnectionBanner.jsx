import { useEffect, useState } from 'react'
import { onStatus } from '../../lib/socket.js'

export default function ConnectionBanner() {
  const [status, setStatus] = useState('connected')
  useEffect(() => onStatus(setStatus), [])
  if (status === 'connected') return null
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-[var(--warning)] text-black text-center text-sm py-1">
      Reconnecting…
    </div>
  )
}
