// Editing a Stock Lot: the form's state and its rules. Plain TypeScript, no React (docs/dev/design/b5-st.md).
import { parseAmount, type AmountError } from './amount'
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

/** A strict YYYY-MM-DD calendar date. */
export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.toISOString().slice(0, 10) === value
}

/** Good until suggested for a purchase date: the date plus the Shelf Life in days; null without a Shelf Life. */
export function suggestGoodUntil(purchased: string, shelfLifeDays: number | null | undefined): string | null {
  if (shelfLifeDays == null || !isIsoDate(purchased)) return null
  const [year, month, day] = purchased.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day + shelfLifeDays))
  return date.toISOString().slice(0, 10)
}

/**
 * The form for a Lot: its quantity as text, its dates, nothing touched. The switch is on only for a Lot without a go-off
 * date whose Ingredient has no Shelf Life: where a Shelf Life applies, Good until is required and the User picks it.
 */
export function initialForm(lot: StockLot): LotForm {
  return {
    quantity: String(lot.quantity),
    purchased: lot.purchased,
    goesOff: lot.goesOff ?? '',
    noGoOff: lot.goesOff === null && lot.shelfLifeDays == null,
    goesOffTouched: false,
  }
}

/** Bought on changed: Good until follows the Shelf Life (suggestGoodUntil) unless it was touched or there is no Shelf Life. */
export function changePurchased(form: LotForm, purchased: string, shelfLifeDays: number | null | undefined): LotForm {
  const next = { ...form, purchased }
  if (form.goesOffTouched) return next
  const suggested = suggestGoodUntil(purchased, shelfLifeDays)
  if (suggested === null) return next
  return { ...next, goesOff: suggested, noGoOff: false }
}

/** Good until chosen by hand: it is touched and the switch goes off. */
export function changeGoesOff(form: LotForm, goesOff: string): LotForm {
  return { ...form, goesOff, goesOffTouched: true, noGoOff: false }
}

/** The "No go-off date" switch. On clears Good until; off suggests it again from Bought on and the Shelf Life. */
export function toggleNoGoOff(form: LotForm, on: boolean, shelfLifeDays: number | null | undefined): LotForm {
  if (on) return { ...form, noGoOff: true, goesOff: '', goesOffTouched: true }
  return { ...form, noGoOff: false, goesOff: suggestGoodUntil(form.purchased, shelfLifeDays) ?? '', goesOffTouched: true }
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
  const errors: LotFormErrors = {}
  const patch: LotPatch = {}

  const amount = parseAmount(form.quantity, 'positive')
  if (!amount.ok) errors.quantity = amount.error
  else if (amount.value !== lot.quantity) patch.quantity = amount.value

  const purchasedValid = isIsoDate(form.purchased)
  if (!purchasedValid) errors.purchased = 'invalid'
  else if (form.purchased > today) errors.purchased = 'future'
  else if (form.purchased !== lot.purchased) patch.purchased = form.purchased

  if (form.goesOffTouched) {
    if (form.noGoOff) {
      if (lot.goesOff !== null) patch.goesOff = null
    } else if (!isIsoDate(form.goesOff)) {
      errors.goesOff = 'invalid'
    } else if (purchasedValid && form.goesOff < form.purchased) {
      errors.goesOff = 'beforePurchased'
    } else if (form.goesOff !== (lot.goesOff ?? '')) {
      patch.goesOff = form.goesOff
    }
  } else if (purchasedValid && form.purchased !== lot.purchased && isIsoDate(form.goesOff) && form.goesOff < form.purchased) {
    // An untouched, kept Good until that a moved Bought on has passed: the User must choose it again.
    errors.goesOff = 'beforePurchased'
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, patch }
}
