export function formatTime(s) {
  if (!isFinite(s) || s < 0) return '0:00'
  const m   = Math.floor(s / 60)
  const sec = String(Math.floor(s % 60)).padStart(2, '0')
  return `${m}:${sec}`
}

export function formatBadge(fmt, stemCount = 0) {
  if (fmt === 'sloppak') return stemCount > 1 ? `sloppak +${stemCount} stems` : 'sloppak'
  return fmt ?? ''
}

export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
