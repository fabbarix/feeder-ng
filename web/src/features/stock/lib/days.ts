const DAY_MS = 86_400_000

function utcDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)
}

/** Whole days from a to b (YYYY-MM-DD), DST-safe. */
export function daysBetween(a: string, b: string): number {
  return Math.round((utcDay(b) - utcDay(a)) / DAY_MS)
}
