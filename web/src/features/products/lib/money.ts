// Money helpers. Prices are integer minor currency units (cents for USD); the
// Household's Currency comes from its settings. Plain TypeScript, no React.

/** Minor-unit digits of an ISO 4217 code (USD 2, JPY 0), from Intl. */
export function fractionDigits(currency: string): number {
  void currency
  throw new Error('TODO')
}

/** "$1.59" (locale en-US unless given). */
export function formatMinor(cents: number, currency: string, locale?: string): string {
  void cents; void currency; void locale
  throw new Error('TODO')
}

/** Plain decimal text without symbol or grouping, e.g. 159 -> "1.59" (USD), 159 -> "159" (JPY). */
export function formatMajor(cents: number, currency: string): string {
  void cents; void currency
  throw new Error('TODO')
}

/**
 * Parses what a person types into minor units without floating point error:
 * "1.59" and "1,59" -> 159, "19.99" -> 1999, "2" -> 200. Surrounding spaces are
 * ignored. null for empty, non-numeric, negative, or more decimals than the
 * currency has ("1.599" for USD). Zero is returned as 0 (callers require > 0).
 */
export function parseMajor(text: string, currency: string): number | null {
  void text; void currency
  throw new Error('TODO')
}

/** "$2.27 / kg". */
export function formatPricePerKg(cents: number, currency: string, locale?: string): string {
  void cents; void currency; void locale
  throw new Error('TODO')
}
