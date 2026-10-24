export default function Input({ className = '', ...props }) {
  return (
    <input
      className={`w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--link-and-focus)] ${className}`}
      {...props}
    />
  )
}
