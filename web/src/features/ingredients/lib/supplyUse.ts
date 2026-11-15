// H9 (household-items.md section 4.11): the pure rules of the Supplies list's stock level and quick Use. Plain TypeScript, no React.
import { isBelowLevel, restockReason } from '../../../lib/restock'
import { formatQuantity, type BaseUnit, type UnitSystem } from '../../../lib/units'
import { strings } from '../strings'
import { displayName } from './names'

const S = strings.supplyUse
/** Float dust: a quantity this close to 0 is none, and this close to a level is at it. */
const EPS = 1e-9

export interface StockLevelText {
  text: string
  /** The short form for a narrow row ("4 in Stock"); '' when the text has none. */
  compact: string
  /** Stock under the Restock level (equal is not below); true for no Stock when a level is set. The info tone follows it. */
  below: boolean
}

/**
 * The stock level of a Supply row, in the one Restock wording (SSP-05, decision SSP 4; the rule is lib/restock):
 * "9 in Stock · Restocks below 6" (compact "9 in Stock"), "Below 6 · 4 in Stock" (compact "4 in Stock"), "9 pieces" with no
 * level, "None in Stock" with neither. A piece amount is the bare number; a g or ml amount carries its unit.
 */
export function stockLevel(total: number, level: number | null, baseUnit: BaseUnit, system: UnitSystem): StockLevelText {
  if (level === null) {
    return total > EPS ? { text: formatQuantity(total, baseUnit, system), compact: '', below: false } : { text: S.noneInStock, compact: '', below: false }
  }
  // Float dust at the level is at it (not below), as the server reads it.
  const stock = Math.abs(total - level) <= EPS ? level : total
  const reason = restockReason(stock, level, baseUnit, system)
  return { text: reason.long, compact: reason.compact, below: isBelowLevel(stock, level) }
}

/** A Supply can be used when it has Stock (beyond float dust). */
export function canUse(total: number): boolean {
  return Number.isFinite(total) && total > EPS
}

/** Pieces use one per tap; g and ml open the "how much" sheet. */
export function usesInOneTap(baseUnit: BaseUnit): boolean {
  return baseUnit === 'piece'
}

/** The sheet's first amount: the pack size of the Product last bought, never above Stock; null when no pack size is known. */
export function sheetStart(packSize: number | null, total: number): number | null {
  if (packSize === null || !(packSize > 0)) return null
  return Math.min(packSize, total)
}

/** The sheet's typed amount: blank is null, a comma reads as a decimal point, text that is not a number is NaN (refused as "more than 0"). */
export function parseAmountText(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export type UseAmount = { ok: true; value: number } | { ok: false; error: string }

/** A typed amount for the sheet: it must be there, more than 0, and no more than is in Stock. */
export function checkUseAmount(value: number | null, total: number, baseUnit: BaseUnit, system: UnitSystem): UseAmount {
  if (value === null) return { ok: false, error: S.enterAmount }
  if (!(value > 0) || !Number.isFinite(value)) return { ok: false, error: S.moreThanZero }
  if (value > total + EPS) return { ok: false, error: S.onlyInStock(formatQuantity(total, baseUnit, system)) }
  return { ok: true, value }
}

/** The amount of a Use in words, for the toasts: "1 Toilet paper" for pieces, "250 ml of Dish soap" for g and ml. */
export function usedAmount(name: string, quantity: number, baseUnit: BaseUnit, system: UnitSystem): string {
  if (baseUnit === 'piece') return `${quantity} ${displayName(name)}`
  return S.ofName(formatQuantity(quantity, baseUnit, system), displayName(name))
}

/** The button's accessible name: "Use one Toilet paper" for pieces, "Use some Dish soap" for g and ml. */
export function useLabel(name: string, baseUnit: BaseUnit): string {
  return baseUnit === 'piece' ? S.useOne(displayName(name)) : S.useSome(displayName(name))
}
