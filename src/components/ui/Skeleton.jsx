export default function Skeleton({ className = '', style }) {
  return <div className={`animate-pulse rounded-[10px] bg-[var(--surface-2)] ${className}`} style={style} />
}
