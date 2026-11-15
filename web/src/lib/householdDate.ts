// B9-20 (RES-05): the Household's calendar date from its IANA zone. Plain TypeScript. STUB for the tests.
export function isValidTimeZone(_tz: unknown): _tz is string {
  throw new Error('not implemented (B9-20)')
}
/** `YYYY-MM-DD` in `timeZone` at `now`. */
export function todayIn(_timeZone: string, _now: Date | number | string): string {
  throw new Error('not implemented (B9-20)')
}
/** `todayIn`, or null when the zone is unknown or invalid: never the device's date. */
export function householdToday(_timeZone: string | null | undefined, _now?: Date | number | string): string | null {
  throw new Error('not implemented (B9-20)')
}
