// Pure date helpers for Leftover copy: YYYY-MM-DD strings, UTC arithmetic, no browser time zone. STUB (red).

const unused = <T>(v: T): T => v

/** The date n days after `date` (n may be negative). */
export function addDays(date: string, _n: number): string {
  return unused(date)
}

/** Whole days from `b` to `a` (a - b). */
export function dayDiff(_a: string, _b: string): number {
  return 0
}

/** "Tue". */
export function weekdayShort(_date: string): string {
  return ''
}

/** "9 Feb". */
export function shortDate(_date: string): string {
  return ''
}

/** "today", "tomorrow", a short weekday within 6 days either way, else "9 Feb". */
export function dateWord(_date: string, _today: string): string {
  return ''
}
