// Editing a Stock Lot: the form's state and its rules. Plain TypeScript, no React (docs/dev/design/b5-st.md).
import type { AmountError } from './amount'
import type { LotPatch, StockLot } from '../types'

/** What the Edit sheet holds while the User types. Dates are YYYY-MM-DD or ''. */
export interface LotForm {
  quantity: string
  purchased: string
  goesOff: string
  /** The "No go-off date" switch. */
  noGoOff: boolean
  /** The User chose Good until (or the switch) by hand, so a later change of Bought on leaves it alone. */
  goesOffTouched: boolean
}

export type LotFormErrors = {
  quantity?: AmountError
  purchased?: 'future' | 'invalid'
  goesOff?: 'beforePurchased' | 'invalid'
}

export type LotFormCheck = { ok: true; patch: LotPatch } | { ok: false; errors: LotFormErrors }

/** Good until suggested for a purchase date: the date plus the Shelf Life in days; null without a Shelf Life. */
export function suggestGoodUntil(purchased: string, shelfLifeDays: number | null | undefined): string | null {
  void purchased
  void shelfLifeDays
  throw new Error('not implemented (b5-st)')
}

/** The form for a Lot: its quantity as text, its dates, the switch on when it has no go-off date, nothing touched. */
export function initialForm(lot: StockLot): LotForm {
  void lot
  throw new Error('not implemented (b5-st)')
}

/** Bought on changed: Good until follows the Shelf Life (suggestGoodUntil) unless it was touched or there is no Shelf Life. */
export function changePurchased(form: LotForm, purchased: string, shelfLifeDays: number | null | undefined): LotForm {
  void purchased
  void shelfLifeDays
  return form
}

/** Good until chosen by hand: it is touched and the switch goes off. */
export function changeGoesOff(form: LotForm, goesOff: string): LotForm {
  void goesOff
  return form
}

/** The "No go-off date" switch. On clears Good until; off suggests it again from Bought on and the Shelf Life. */
export function toggleNoGoOff(form: LotForm, on: boolean, shelfLifeDays: number | null | undefined): LotForm {
  void on
  void shelfLifeDays
  return form
}

/**
 * Checks the form against the Lot and today (YYYY-MM-DD) and builds the patch of what changed:
 * - quantity: parseAmount 'positive' (a decimal comma is fine); sent when it differs from the Lot's;
 * - purchased: a calendar date not after today; sent when it differs;
 * - goesOff: sent only when the User touched it (or the switch) and it differs from the Lot's: a date not before
 *   Bought on, or null for "No go-off date" (only when the Lot has one). A changed Bought on with Good until untouched
 *   sends no goesOff: the server suggests it again;
 * - nothing changed: `{ ok: true, patch: {} }`.
 */
export function checkLotForm(form: LotForm, lot: StockLot, today: string): LotFormCheck {
  void form
  void lot
  void today
  throw new Error('not implemented (b5-st)')
}
