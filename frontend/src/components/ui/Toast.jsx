import { useEffect, useState } from 'react'

let listeners = []
export function toast(message) {
  listeners.forEach((fn) => fn(message))
}

export default function ToastHost() {
  const [msg, setMsg] = useState(null)
  useEffect(() => {
    const fn = (m) => { setMsg(m); setTimeout(() => setMsg(null), 3000) }
    listeners.push(fn)
    return () => { listeners = listeners.filter((x) => x !== fn) }
  }, [])
  if (!msg) return null
  return (
    <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-50 rounded-[14px] bg-[var(--surface)] border border-[var(--border)] px-4 py-2 text-sm shadow-lg">
      {msg}
    </div>
  )
}
