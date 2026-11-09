// Price form rules. Plain TypeScript, no React.
import { strings } from '../strings'
import type { Price, PriceBody } from '../types'
import { formatMajor, parseMajor } from './money'

/** What the inputs hold. `price` and `perKg` are in major units as typed ("1.59"). */
export interface PriceFormValues {
  shopId: number | null
  /** YYYY-MM-DD */
  date: string
  price: string
  perKg: string
}

export type PriceFormErrors = Partial<Record<'shopId' | 'date' | 'amount', string>>

function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

/** The amount typed, in minor units: undefined when blank, null when unreadable or zero. */
function amount(text: string, currency: string): number | null | undefined {
  if (text.trim() === '') return undefined
  const n = parseMajor(text, currency)
  return n !== null && n > 0 ? n : null
}

/**
 * shopId required; date a real YYYY-MM-DD; at least one of price / perKg filled,
 * each filled one parsing (money.parseMajor for the currency) to more than zero.
 */
export function validatePriceForm(v: PriceFormValues, currency: string): PriceFormErrors {
  const errors: PriceFormErrors = {}
  if (v.shopId === null) errors.shopId = strings.errShop
  if (!isRealDate(v.date)) errors.date = strings.errDate
  const price = amount(v.price, currency)
  const perKg = amount(v.perKg, currency)
  if (price === null || perKg === null || (price === undefined && perKg === undefined)) {
    errors.amount = strings.errAmount
  }
  return errors
}

/** Request body: only the filled amounts, in minor units. Call after validatePriceForm is {}. */
export function toPriceBody(v: PriceFormValues, currency: string): PriceBody {
  const body: PriceBody = { shopId: v.shopId ?? 0, date: v.date }
  const price = amount(v.price, currency)
  const perKg = amount(v.perKg, currency)
  if (price) body.priceCents = price
  if (perKg) body.pricePerKgCents = perKg
  return body
}

/**
 * Starting values for a new Price at a Shop: the latest Price there prefills
 * `price` (pack price as major units) and `perKg` (only when it was recorded
 * explicitly, not derived); both empty when there is none. `today` is YYYY-MM-DD.
 */
export function prefillPrice(
  latest: Price | null,
  shopId: number | null,
  today: string,
  currency: string,
): PriceFormValues {
  const price = latest?.priceCents != null ? formatMajor(latest.priceCents, currency) : ''
  const perKg =
    latest?.pricePerKgCents != null && !latest.pricePerKgDerived ? formatMajor(latest.pricePerKgCents, currency) : ''
  return { shopId, date: today, price, perKg }
}

/** Today's date in the browser's time zone as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
