import { useThemeStore } from '../../store/theme.js'

export default function Avatar({ src, name = '', size = 40, online = false, className = '' }) {
  const initials = name.trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className={`relative inline-flex items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)] font-medium overflow-hidden ${className}`} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {src ? <img src={src} alt={name} className="w-full h-full object-cover" /> : initials}
      {online && (
        <span className="absolute bottom-0 right-0 block rounded-full border-2 border-[var(--surface)] bg-[var(--online)]" style={{ width: size * 0.28, height: size * 0.28 }} />
      )}
    </div>
  )
}
