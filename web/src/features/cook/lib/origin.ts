// B9-45 (PC-02): where Cook Mode was opened from, and where Exit and the Cooked confirmation return to. Plain TypeScript. STUBS.

/** A place Cook Mode can return to: its path (with any query) and the word the button says ("Plan": "Back to Plan"). */
export interface CookOrigin {
  path: string
  label: string
}

/** The origin when none was passed. */
export const TODAY_ORIGIN: CookOrigin = { path: '/', label: 'Today' }

/** The origin of a router `location.state` ({ from: "/plan" }); null for anything that is not a known in-app place (open redirects included). */
export function originOf(_state: unknown): CookOrigin | null {
  throw new Error('B9-45: not built yet')
}

/** Where Cook Mode returns to: the origin, else the fallback, else Today. */
export function returnTarget(_origin: CookOrigin | null, _fallback?: CookOrigin): CookOrigin {
  throw new Error('B9-45: not built yet')
}

/** "Back to Plan", "Back to Today", "Back to Recipe". */
export function backLabel(_origin: CookOrigin): string {
  throw new Error('B9-45: not built yet')
}
