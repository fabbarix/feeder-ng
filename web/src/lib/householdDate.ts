// B9-20 (RES-05): the Household's calendar date from its IANA zone. Plain TypeScript.

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    formatters.set(timeZone, f)
  }
  return f
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz === '') return false
  try {
    formatter(tz)
    return true
  } catch {
    return false
  }
}

/** `YYYY-MM-DD` in `timeZone` at `now`. */
export function todayIn(timeZone: string, now: Date | number | string): string {
  const parts = formatter(timeZone).formatToParts(new Date(now))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** `todayIn`, or null when the zone is unknown or invalid: never the device's date. */
export function householdToday(timeZone: string | null | undefined, now: Date | number | string = Date.now()): string | null {
  return isValidTimeZone(timeZone) ? todayIn(timeZone, now) : null
}
