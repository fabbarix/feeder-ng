// The typed-text model behind PriceKeypad (shop-scan-proposals.md 13.4). What is typed is TEXT ("1.2"), with "." as the
// internal decimal key; the locale's separator is only shown. Plain TypeScript, no React.
import { uiStrings } from '../strings'

/** Whole digits a Price can take before the decimal key (a shelf label never needs more). */
export const MAX_WHOLE_DIGITS = 6

/** Minor-unit digits of an ISO 4217 code (EUR 2, JPY 0). Local copy: ui/ does not import features/. */
function digitsOf(currency: string): number {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
}

/** True when the currency has minor units, so the decimal key shows. */
export function hasDecimalKey(currency: string): boolean {
  return digitsOf(currency) > 0
}

/** The Household locale's decimal separator, or null for a currency with no minor units. */
export function decimalSeparator(currency: string, locale: string): string | null {
  if (!hasDecimalKey(currency)) return null
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1 }).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? '.'
}

/** A digit key. No leading zeros, at most MAX_WHOLE_DIGITS before the decimal key, minor digits only after it. */
export function pressDigit(text: string, digit: string, currency: string): string {
  if (!/^[0-9]$/.test(digit)) return text
  const dot = text.indexOf('.')
  if (dot >= 0) return text.length - dot - 1 < digitsOf(currency) ? text + digit : text
  if (text === '0') return digit
  if (text.length >= MAX_WHOLE_DIGITS) return text
  return text + digit
}

/** The decimal key: "0." when it comes first, ignored when there is already one or the currency has no minor units. */
export function pressDecimal(text: string, currency: string): string {
  if (!hasDecimalKey(currency) || text.includes('.')) return text
  return text === '' ? '0.' : `${text}.`
}

/** Backspace removes the last character; "0." (typed as one key) goes back to empty. */
export function pressBackspace(text: string): string {
  if (text === '0.') return ''
  return text.slice(0, -1)
}

/** Minor units of the typed text; null for nothing typed. "1." is 100; zero is returned, the caller refuses it. */
export function typedToMinor(text: string, currency: string): number | null {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(text)
  if (!m || text === '') return null
  const digits = digitsOf(currency)
  const whole = m[1] || '0'
  const frac = (m[2] ?? '').slice(0, digits).padEnd(digits, '0')
  return Number(whole + frac)
}

/** Typed text for minor units, with every digit the keys can produce: 129 -> "1.29", 5 -> "0.05". */
export function typedFromMinor(cents: number, currency: string): string {
  const digits = digitsOf(currency)
  if (digits === 0) return String(cents)
  const s = String(cents).padStart(digits + 1, '0')
  return `${s.slice(0, -digits)}.${s.slice(-digits)}`
}

const NUMBER_PARTS = new Set(['integer', 'group', 'decimal', 'fraction'])

/** Money with the typed number in place: the currency's own symbol placement and grouping, the typed decimals as typed. */
export function formatTyped(text: string, currency: string, locale: string): string {
  const [whole = '', frac] = text.split('.')
  const grouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(whole === '' ? 0 : Number(whole))
  const number = frac === undefined ? grouped : `${grouped}${decimalSeparator(currency, locale) ?? '.'}${frac}`
  let out = ''
  let placed = false
  for (const part of new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(1)) {
    if (!NUMBER_PARTS.has(part.type)) out += part.value
    else if (!placed) {
      out += number
      placed = true
    }
  }
  return out
}

/** A Price in the Household's currency and locale, e.g. "€1.29". */
export function formatPriceMinor(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 10 ** digitsOf(currency))
}

/** "Last time here €1.29 · 3 Nov" (en-GB) or "· Nov 3" (en-US). The date is a calendar day, so it is read in UTC. */
export function lastPriceHint(p: { cents: number; date: string; currency: string; locale: string }): string {
  const day = new Intl.DateTimeFormat(p.locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${p.date}T00:00:00Z`))
  return uiStrings.lastTimeHere(formatPriceMinor(p.cents, p.currency, p.locale), day)
}

/** "No Price at Esselunga yet". */
export function noPriceHint(shop: string): string {
  return uiStrings.noPriceAt(shop)
}
