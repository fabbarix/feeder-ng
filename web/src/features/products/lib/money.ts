// Money helpers. Prices are integer minor currency units (cents for USD); the
// Household's Currency comes from its settings. Plain TypeScript, no React.

/** Minor-unit digits of an ISO 4217 code (USD 2, JPY 0), from Intl. */
export function fractionDigits(currency: string): number {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
}

/** "$1.59" (locale en-US unless given). */
export function formatMinor(cents: number, currency: string, locale = 'en-US'): string {
  const digits = fractionDigits(currency)
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 10 ** digits)
}

/** Plain decimal text without symbol or grouping, e.g. 159 -> "1.59" (USD), 159 -> "159" (JPY). */
export function formatMajor(cents: number, currency: string): string {
  const digits = fractionDigits(currency)
  if (digits === 0) return String(cents)
  const s = String(Math.abs(cents)).padStart(digits + 1, '0')
  return `${cents < 0 ? '-' : ''}${s.slice(0, -digits)}.${s.slice(-digits)}`
}

/**
 * Parses what a person types into minor units without floating point error:
 * "1.59" and "1,59" -> 159, "19.99" -> 1999, "2" -> 200. Surrounding spaces are
 * ignored. null for empty, non-numeric, negative, or more decimals than the
 * currency has ("1.599" for USD). Zero is returned as 0 (callers require > 0).
 */
export function parseMajor(text: string, currency: string): number | null {
  const m = /^(\d*)(?:[.,](\d*))?$/.exec(text.trim())
  if (!m) return null
  const whole = m[1] ?? ''
  const frac = m[2] ?? ''
  if (whole === '' && frac === '') return null
  const digits = fractionDigits(currency)
  if (frac.length > digits) return null
  const n = Number(whole + frac.padEnd(digits, '0'))
  return Number.isSafeInteger(n) ? n : null
}

/** "$2.27 / kg". */
export function formatPricePerKg(cents: number, currency: string, locale?: string): string {
  return `${formatMinor(cents, currency, locale)} / kg`
}
