// B9-45 (PC-02): where Cook Mode was opened from, and where Exit and the Cooked confirmation return to. Plain TypeScript.
// Only in-app places Cook Mode is opened from are accepted (Today "/", the Plan "/plan" with its query, a Recipe "/recipes/<id>"),
// so a crafted state can never send the User elsewhere.

/** A place Cook Mode can return to: its path (with any query) and the word the button says ("Plan": "Back to Plan"). */
export interface CookOrigin {
  path: string
  label: string
}

/** The origin when none was passed. */
export const TODAY_ORIGIN: CookOrigin = { path: '/', label: 'Today' }

const PLACES: { pattern: RegExp; label: string }[] = [
  { pattern: /^\/$/, label: 'Today' },
  { pattern: /^\/plan(\?[^#\s]*)?$/, label: 'Plan' },
  { pattern: /^\/recipes\/\d+$/, label: 'Recipe' },
]

/** The origin of a router `location.state` ({ from: "/plan" }); null for anything that is not a known in-app place (open redirects included). */
export function originOf(state: unknown): CookOrigin | null {
  if (typeof state !== 'object' || state === null) return null
  const from = (state as { from?: unknown }).from
  if (typeof from !== 'string') return null
  const place = PLACES.find((p) => p.pattern.test(from))
  return place ? { path: from, label: place.label } : null
}

/** Where Cook Mode returns to: the origin, else the fallback, else Today. */
export function returnTarget(origin: CookOrigin | null, fallback?: CookOrigin): CookOrigin {
  return origin ?? fallback ?? TODAY_ORIGIN
}

/** "Back to Plan", "Back to Today", "Back to Recipe". */
export function backLabel(origin: CookOrigin): string {
  return `Back to ${origin.label}`
}
