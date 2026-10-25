import { useState } from 'react'

export default function Popover({ trigger, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative inline-block">
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && (
        <div className="absolute z-50 mt-2 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-lg" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  )
}
