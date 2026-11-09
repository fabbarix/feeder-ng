// Price form rules. Plain TypeScript, no React.
import type { Price, PriceBody } from '../types'

/** What the inputs hold. `price` and `perKg` are in major units as typed ("1.59"). */
export interface PriceFormValues {
  shopId: number | null
  /** YYYY-MM-DD */
  date: string
  price: string
  perKg: string
}

export type PriceFormErrors = Partial<Record<'shopId' | 'date' | 'amount', string>>

/**
 * shopId required; date a real YYYY-MM-DD; at least one of price / perKg filled,
 * each filled one parsing (money.parseMajor for the currency) to more than zero.
 */
export function validatePriceForm(v: PriceFormValues, currency: string): PriceFormErrors {
  void v; void currency
  throw new Error('TODO')
}

/** Request body: only the filled amounts, in minor units. Call after validatePriceForm is {}. */
export function toPriceBody(v: PriceFormValues, currency: string): PriceBody {
  void v; void currency
  throw new Error('TODO')
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
  void latest; void shopId; void today; void currency
  throw new Error('TODO')
}
