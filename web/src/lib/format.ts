// Pure display helpers. Plain TypeScript, no React.

/** Formats seconds as m:ss, or h:mm:ss from one hour. Negative values get a leading minus. */
export function formatTimer(totalSeconds: number): string {
  const whole = Math.trunc(Math.abs(totalSeconds))
  const sign = totalSeconds < 0 && whole > 0 ? '-' : ''
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const seconds = String(whole % 60).padStart(2, '0')
  if (hours > 0) return `${sign}${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
  return `${sign}${minutes}:${seconds}`
}

/** Up to two upper-case initials from the first two words of a name; "?" when empty. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return words
    .slice(0, 2)
    .map((word) => (Array.from(word)[0] ?? '').toLocaleUpperCase())
    .join('')
}
