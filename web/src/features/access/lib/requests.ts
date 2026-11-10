// Pure helpers for Access Requests. Plain TypeScript, no React.
import type { AccessRequest } from './../types'

/** Whole days left before the request expires (rounded up, never below 0). */
export function daysLeft(_expiresAt: string, _now: Date): number {
  return -1
}

/** The shell badge text: '' for none, the number up to 9, '9+' above. */
export function badgeText(_count: number): string {
  return 'x'
}

/** Oldest request first; ties by id. Returns a new array. */
export function oldestFirst(requests: AccessRequest[]): AccessRequest[] {
  return requests
}

/** The first letter of the name (or of the email when the name is blank), upper-cased, for an avatar fallback. */
export function initialOf(_name: string, _email: string): string {
  return ''
}
