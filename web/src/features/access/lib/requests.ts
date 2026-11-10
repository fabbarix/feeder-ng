// Pure helpers for Access Requests. Plain TypeScript, no React.
import type { AccessRequest } from './../types'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

/** Whole days left before the request expires (rounded up, never below 0). */
export function daysLeft(expiresAt: string, now: Date): number {
  const end = Date.parse(expiresAt)
  if (Number.isNaN(end)) return 0
  return Math.max(0, Math.ceil((end - now.getTime()) / DAY_MS))
}

/** The shell badge text: '' for none, the number up to 9, '9+' above. */
export function badgeText(count: number): string {
  if (count <= 0) return ''
  return count > 9 ? '9+' : String(count)
}

/** Oldest request first; ties by id. Returns a new array. */
export function oldestFirst(requests: AccessRequest[]): AccessRequest[] {
  return [...requests].sort((a, b) => Date.parse(a.requestedAt) - Date.parse(b.requestedAt) || a.id - b.id)
}

/** The first letter of the name (or of the email when the name is blank), upper-cased, for an avatar fallback. */
export function initialOf(name: string, email: string): string {
  const source = name.trim() || email.trim()
  return source ? source.slice(0, 1).toUpperCase() : '?'
}

export type Elapsed =
  | { unit: 'now' }
  | { unit: 'minutes' | 'hours' | 'days'; n: number }

/** How long before `now` an instant was: now (under a minute), then whole minutes, hours or days (rounded down). */
export function elapsedSince(iso: string, now: Date): Elapsed {
  const ms = now.getTime() - Date.parse(iso)
  if (Number.isNaN(ms) || ms < 60_000) return { unit: 'now' }
  if (ms < HOUR_MS) return { unit: 'minutes', n: Math.floor(ms / 60_000) }
  if (ms < DAY_MS) return { unit: 'hours', n: Math.floor(ms / HOUR_MS) }
  return { unit: 'days', n: Math.floor(ms / DAY_MS) }
}
