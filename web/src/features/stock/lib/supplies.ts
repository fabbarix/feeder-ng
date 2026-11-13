// Supplies in the Pantry (household-items.md 4.2, 4.7, 6; H6): a Supply is a Stock Lot or Ingredient of kind "supply". It never goes
// off, so its rows carry no go-off wording; it says when it restocks instead. Plain TypeScript, no React.
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { stockStrings as strings } from '../strings'
import { boughtLabel } from './ingredientLots'
import type { BaseUnit, IngredientStock, StockKind, StockLot } from '../types'

/** Anything that carries a kind: a Stock Lot, a By Ingredient row or an Add to Stock choice. Absent = food (an older answer). */
export interface KindOf {
  kind?: StockKind
}

/** A Supply's Restock level and the Stock it has now, in Base Units: the shape of a Shopping List Line. */
export interface Restock {
  level: number
  stock: number
}

/** The Ingredients that carry a Restock level, by id (a Supply with a level only; food never has one, D3). */
export function restockLevelsOf(choices: readonly (KindOf & { id: number; restockLevel?: number | null })[]): Map<number, number> {
  const levels = new Map<number, number>()
  for (const c of choices) {
    if (isSupply(c) && typeof c.restockLevel === 'number') levels.set(c.id, c.restockLevel)
  }
  return levels
}

/** The Stock of each Supply, summed over its Lots in every Storage Place; food is skipped. */
export function supplyStockOf(lots: readonly StockLot[]): Map<number, number> {
  const stock = new Map<number, number>()
  for (const lot of lots) {
    if (!isSupply(lot)) continue
    stock.set(lot.ingredientId, (stock.get(lot.ingredientId) ?? 0) + lot.quantity)
  }
  return stock
}

/** The Restock of one Ingredient, or null when it has no level (food, or a Supply without one). A Supply with no Stock has 0. */
export function restockOf(ingredientId: number, levels: ReadonlyMap<number, number>, stock: ReadonlyMap<number, number>): Restock | null {
  const level = levels.get(ingredientId)
  if (level === undefined) return null
  return { level, stock: stock.get(ingredientId) ?? 0 }
}

/** True only when Stock is less than the Restock level; at the level it is not below. */
export function isBelowRestock(restock: Restock | null): boolean {
  return restock !== null && restock.stock < restock.level
}

/** True for a Supply: kind "supply". Absent kind (an older answer) is food. */
export function isSupply(item: KindOf): boolean {
  return item.kind === 'supply'
}

/** True while the Household has a Supply, in its catalogue or in its Stock. */
export function householdHasSupply(lots: readonly StockLot[], choices: readonly KindOf[]): boolean {
  return lots.some(isSupply) || choices.some(isSupply)
}

/** The Restock level as the row says it: a piece is a bare count ("6"); millilitres and grams keep their unit. */
function levelText(level: number, baseUnit: BaseUnit, system: UnitSystem): string {
  return baseUnit === 'piece' ? String(level) : formatQuantity(level, baseUnit, system)
}

/** "restocks below 6", "restocks below 1000 ml", or "below Restock level 6" when Stock is under it; '' without a level. */
export function restockPhrase(restock: Restock | null, baseUnit: BaseUnit, system: UnitSystem): string {
  if (restock === null) return ''
  const level = levelText(restock.level, baseUnit, system)
  return isBelowRestock(restock) ? strings.supplies.belowRestock(level) : strings.supplies.restocksBelow(level)
}

/** The meta of a Supply Lot row: "4 pieces · restocks below 6". Never a go-off phrase. */
export function supplyLotMeta(lot: StockLot, restock: Restock | null, system: UnitSystem): string {
  const parts = [formatQuantity(lot.quantity, lot.baseUnit, system)]
  const phrase = restockPhrase(restock, lot.baseUnit, system)
  if (phrase) parts.push(phrase)
  return parts.join(' · ')
}

/** The meta of a Supply in By Ingredient: "2 Stock Lots · restocks below 6". Never a go-off phrase. */
export function supplyRowMeta(item: IngredientStock, restock: Restock | null, system: UnitSystem): string {
  const parts = [strings.lotCount(item.lotCount)]
  const phrase = restockPhrase(restock, item.baseUnit, system)
  if (phrase) parts.push(phrase)
  return parts.join(' · ')
}

/** The meta of a Supply's Lot inside its By Ingredient row: "Bought today · Utility cupboard". Never a go-off part. */
export function supplyLotLineMeta(lot: StockLot, today: string, placeName: string | null): string {
  return [boughtLabel(lot.purchased, today), placeName ?? strings.unsorted].join(' · ')
}

/** The amount the User typed as "Used up": blank is the whole Lot (`used` undefined), else a positive number no more than the Lot holds. */
export type UsedUpCheck = { ok: true; used: number | undefined } | { ok: false; error: 'tooMuch' | 'notPositive' | 'negative' | 'invalid' }

/** Checks what was typed in "How much was used up". A decimal comma works; the whole quantity is the whole Lot. */
export function checkUsedUp(input: string, lot: { quantity: number }): UsedUpCheck {
  const raw = input.trim().replace(',', '.')
  if (raw === '') return { ok: true, used: undefined }
  if (raw.startsWith('-')) return { ok: false, error: 'negative' }
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(raw)) return { ok: false, error: 'invalid' }
  const used = Number(raw)
  if (used === 0) return { ok: false, error: 'notPositive' }
  if (used > lot.quantity) return { ok: false, error: 'tooMuch' }
  if (used === lot.quantity) return { ok: true, used: undefined }
  return { ok: true, used }
}

/** What "Used up" sends: the whole Lot is a DELETE of it; part of it a PATCH with the quantity that remains. Never waste. */
export type UsedUpRequest = { type: 'delete' } | { type: 'patch'; quantity: number }

export function usedUpRequest(lot: { id?: number; quantity: number }, used: number | undefined): UsedUpRequest {
  if (used === undefined || used >= lot.quantity) return { type: 'delete' }
  return { type: 'patch', quantity: Number((lot.quantity - used).toFixed(6)) }
}
