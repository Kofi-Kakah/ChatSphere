export default function Badge({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full bg-[var(--primary)] text-white text-xs font-medium px-2 py-0.5 ${className}`}>
      {children}
    </span>
  )
}
