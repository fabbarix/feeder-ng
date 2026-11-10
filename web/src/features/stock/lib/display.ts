// Display-only helpers for the Stock feature. Plain TypeScript, no React.

const MONTHS_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/**
 * A YYYY-MM-DD date as en-GB day and short month ("2026-11-05" -> "5 Nov"). Built in UTC so the day never shifts
 * with the viewer's zone. Anything that is not a calendar date is returned unchanged.
 */
export function formatLotDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (Number.isNaN(date.getTime())) return iso
  return MONTHS_FORMAT.format(date)
}

/** Sentence case for display: upper-cases the first character and leaves the rest as stored ("feta" -> "Feta"). */
export function capitalise(text: string): string {
  const first = Array.from(text)[0]
  if (first === undefined) return text
  return first.toLocaleUpperCase('en-GB') + text.slice(first.length)
}
