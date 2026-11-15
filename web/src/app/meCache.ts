import { isValidTimeZone } from '../lib/householdDate'
// The last successful /api/me, kept in localStorage so the shell can open offline (R10). Plain TypeScript, no React.
import type { Me } from './useMe'

export const ME_CACHE_KEY = 'feeder.me'

export function readCachedMe(): Me | null {
  try {
    const raw = localStorage.getItem(ME_CACHE_KEY)
    if (!raw) return null
    const v: unknown = JSON.parse(raw)
    if (typeof v !== 'object' || v === null) return null
    const o = v as Record<string, unknown>
    if (
      typeof o.id !== 'number' ||
      typeof o.email !== 'string' ||
      typeof o.displayName !== 'string' ||
      typeof o.isAdmin !== 'boolean'
    ) {
      return null
    }
    const me: Me = { id: o.id, email: o.email, displayName: o.displayName, isAdmin: o.isAdmin }
    if (isValidTimeZone(o.householdTimeZone)) me.householdTimeZone = o.householdTimeZone
    return me
  } catch {
    return null
  }
}

export function writeCachedMe(me: Me): void {
  try {
    localStorage.setItem(ME_CACHE_KEY, JSON.stringify(me))
  } catch {
    // storage blocked: the shell just cannot open offline
  }
}

export function clearCachedMe(): void {
  try {
    localStorage.removeItem(ME_CACHE_KEY)
  } catch {
    // nothing to forget
  }
}

/** B9-20 (RES-05): the Household's IANA zone from the last /api/me, or null. */
export function readCachedTimeZone(): string | null {
  return readCachedMe()?.householdTimeZone ?? null
}
