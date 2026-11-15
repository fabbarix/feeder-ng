import type { IngredientStock, StockLot } from '../../stock/types'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { todayStrings } from '../strings'
import type { UseSoonItem } from '../types'
import { shortWeekday } from './dates'

const DAY_MS = 86_400_000

/** Whole days from one household date (YYYY-MM-DD) to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

/** The short row wording of the last good day: "good until today", "good until tomorrow", otherwise "good until Thu". */
export function whenWording(date: string, today: string): string {
  const days = daysBetween(today, date)
  if (days <= 0) return todayStrings.goodUntil.today
  if (days === 1) return todayStrings.goodUntil.tomorrow
  return todayStrings.goodUntil.on(shortWeekday(date))
}

/**
 * The Ingredients to use soon: stock flagged useSoon whose soonest go-off is still
 * ahead (spoiled lots belong to the spoiled tile). Soonest first, then by name.
 * B9-44 (TB-11): with the Lots, each row's value is the amount going off on the soonest date (the Lots of that date added up) and it
 * names the soonest Lot (the smaller id on a tie), which the row opens; a spoiled Lot is never it. Without Lots (not loaded yet) the
 * row has the Ingredient's total and no Lot.
 */
export function useSoonItems(totals: IngredientStock[], today: string, lots: StockLot[] = []): UseSoonItem[] {
  const rows: Array<UseSoonItem & { days: number }> = []
  for (const t of totals) {
    if (!t.useSoon || !t.nextGoesOff) continue
    const days = daysBetween(today, t.nextGoesOff)
    if (days < 0) continue
    const item: UseSoonItem & { days: number } = {
      ingredientId: t.ingredientId,
      name: t.name,
      when: whenWording(t.nextGoesOff, today),
      quantity: t.total,
      baseUnit: t.baseUnit,
      days,
    }
    const soonest = soonestLots(lots, t.ingredientId)
    if (soonest.length > 0) {
      item.quantity = soonest.reduce((sum, l) => sum + l.quantity, 0)
      item.soonestLotId = Math.min(...soonest.map((l) => l.id))
    }
    rows.push(item)
  }
  rows.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name))
  return rows.map(({ days: _days, ...item }) => item)
}

/** The Ingredient's not-spoiled Lots that go off on its soonest go-off date. */
function soonestLots(lots: StockLot[], ingredientId: number): StockLot[] {
  const mine = lots.filter((l) => l.ingredientId === ingredientId && !l.spoiled && l.goesOff !== null)
  if (mine.length === 0) return []
  const first = mine.reduce((min, l) => (l.goesOff! < min ? l.goesOff! : min), mine[0]!.goesOff!)
  return mine.filter((l) => l.goesOff === first)
}

export interface UseSoonSplit {
  rows: UseSoonItem[]
  /** Items beyond the first `max`; the tile says "+2 more". */
  more: number
}

/** The first `max` rows of the Use soon tile and how many more there are. */
export function splitUseSoon(items: UseSoonItem[], max = 3): UseSoonSplit {
  return { rows: items.slice(0, max), more: Math.max(0, items.length - max) }
}

/** B9-44 (TB-11): where the Use soon tile's header link and its "+2 more" go: the Pantry filtered to Use soon. */
export const USE_SOON_LINK = '/pantry?status=useSoon'

export interface UseSoonRow {
  /** "Good until tomorrow" (spec §6.1 wording, a sentence on its own line). */
  meta: string
  /** "500 g" in the Household's unit system; null when the amount is not known. */
  amount: string | null
  /** The row's name as one target: "Flour, 500 g, good until tomorrow". */
  name: string
}

/** The words of one Use soon row. */
export function useSoonRow(item: UseSoonItem, system: UnitSystem): UseSoonRow {
  const amount = item.quantity !== undefined && item.baseUnit !== undefined ? formatQuantity(item.quantity, item.baseUnit, system) : null
  const meta = item.when.charAt(0).toLocaleUpperCase() + item.when.slice(1)
  return { meta, amount, name: amount ? todayStrings.useSoonRowName(item.name, amount, item.when) : `${item.name}, ${item.when}` }
}
