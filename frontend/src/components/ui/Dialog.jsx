import { useEffect, useRef } from 'react'

export default function Dialog({ open, onClose, title, children }) {
  const ref = useRef(null)
  useEffect(() => {
    if (open) ref.current?.showModal?.()
    else ref.current?.close?.()
  }, [open])
  if (!open) return null
  return (
    <dialog ref={ref} className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] p-0 backdrop:bg-black/40" onClose={onClose}>
      <div className="p-5">
        {title && <h2 className="text-base font-semibold mb-3">{title}</h2>}
        {children}
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]">Close</button>
        </div>
      </div>
    </dialog>
  )
}
