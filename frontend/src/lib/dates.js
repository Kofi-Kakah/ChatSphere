const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const dayFormatter = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
const fullFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' })

function toDate(value) {
  return value instanceof Date ? value : new Date(value)
}

function startOfLocalDay(value) {
  const d = toDate(value)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function isSameLocalDay(a, b) {
  return startOfLocalDay(a) === startOfLocalDay(b)
}

export function isWithinMinutes(a, b, minutes) {
  return Math.abs(toDate(b).getTime() - toDate(a).getTime()) <= minutes * 60_000
}

export function formatTime(value) {
  return timeFormatter.format(toDate(value))
}

export function formatFullDateTime(value) {
  return fullFormatter.format(toDate(value))
}

export function formatDayLabel(value, now = new Date()) {
  const days = Math.round((startOfLocalDay(now) - startOfLocalDay(value)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return dayFormatter.format(toDate(value))
}
