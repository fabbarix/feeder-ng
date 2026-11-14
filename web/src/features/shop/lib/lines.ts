// Presentation helpers for the Shopping List (no React).
import { formatMinor } from '../../products/lib/money'
import { displayName } from '../../ingredients/lib/names'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import type { BaseUnit, PastPlannedMeal, ShoppingExtra, ShoppingLine, ShoppingList } from '../types'
import { shopStrings } from '../strings'
import { slotsLabel } from './rows'
import { restockText } from './supplies'

/** One tile of the list: a Line or a manual extra, flattened for display. */
export interface ListEntry {
  /** "line:<ingredientId>" or "extra:<id>" */
  key: string
  kind: 'line' | 'extra'
  ingredientId: number | null
  extraId: number | null
  title: string
  /** "1400 g · 2 × Mutti 700 g", "1400 g", "2000 ml" or "" for free text (the Scan live list shows this) */
  detail: string
  /** the quantity of the tile ("1400 g", "2000 ml"); "" for free text and ticked entries (WP7) */
  quantityText: string
  /** the muted pack line ("2 × Mutti 700 g"); "" when there is no pack suggestion or the entry is ticked (WP7) */
  packLine: string
  /** "$3.18"; null when the Line has no Price (nothing is shown, never a dash) or where no estimate applies (extras, ticked lines) */
  estimatedCost: string | null
  ticked: boolean
  /** the remaining amount in Base Units (what "How much?" is prefilled with); 0 for free text and covered lines */
  quantity: number
  baseUnit: BaseUnit | null
  /** PE: the Ingredient's Picture address of a Line or an Ingredient extra; '' = none. */
  imageUrl?: string
  /** H7′: a Supply (a Line or an Ingredient extra of kind supply); food and free text are not. */
  supply: boolean
  /** H7′: "2 of 6" for a Supply Line with a Restock reason; '' otherwise (extras, food, no reason). */
  restockText: string
  /** b8-polish: the compact "2/6" of the same reason, for a narrow row; '' when there is no reason or the Line is ticked. */
  restockCompact: string
  /**
   * B5-SH: "Includes Tue Dinner, not marked Cooked yet" (see pastMealsHint). The key is left out of entries with
   * nothing to say (an extra, a Line without unconfirmed past meals).
   */
  hint?: string
  /** b8-shop: "Tue Dinner +1" for the row's one meta line (no Courses, no "not marked Cooked yet"). Left out with no hint. */
  hintShort?: string
  /**
   * B5-F1: the slot "Mark it" opens (the Plan address /plan?mark=<date>:<mealSlotId>, plan lib/markSlot): the oldest of the Line's unconfirmed past meals.
   * The key is left out with no hint.
   */
  markIt?: { date: string; mealSlotId: number }
}

/** "1400 g · 2 × Mutti 700 g" (quantity via formatQuantity, then packs); just "1400 g" with no pack suggestion. */
export function packText(line: Pick<ShoppingLine, 'quantity' | 'baseUnit' | 'pack'>, system: UnitSystem): string {
  const amount = formatQuantity(line.quantity, line.baseUnit, system)
  return line.pack ? `${amount} · ${line.pack.count} × ${line.pack.name}` : amount
}

/** formatMinor(cents, currency), or null when cents is null (WP7: nothing is shown for a missing Price, never a dash). */
export function priceText(cents: number | null, currency: string): string | null {
  return cents === null ? null : formatMinor(cents, currency)
}

export function lineEntry(line: ShoppingLine, currency: string, system: UnitSystem): ListEntry {
  const hint = pastMealsHint(line.pastPlannedMeals)
  const markIt = hint ? markItTarget(line.pastPlannedMeals) : null
  return {
    ...(hint ? { hint, hintShort: shortHint(line.pastPlannedMeals) } : {}),
    ...(markIt ? { markIt } : {}),
    key: `line:${line.ingredientId}`,
    kind: 'line',
    ingredientId: line.ingredientId,
    extraId: null,
    title: displayName(line.name),
    detail: line.ticked ? '' : packText(line, system),
    // round 2: a ticked Line keeps the quantity it needed (the server's need), muted by the stylesheet
    quantityText: formatQuantity(line.ticked ? line.need : line.quantity, line.baseUnit, system),
    packLine: line.ticked || !line.pack ? '' : `${line.pack.count} × ${line.pack.name}`,
    estimatedCost: priceText(line.estimatedCostCents, currency),
    ticked: line.ticked,
    quantity: line.ticked ? 0 : line.quantity,
    baseUnit: line.baseUnit,
    imageUrl: line.imageUrl,
    supply: line.kind === 'supply',
    restockText: line.kind === 'supply' && line.restock && !line.ticked ? restockText(line.restock, line.baseUnit, system) : '',
    restockCompact:
      line.kind === 'supply' && line.restock && !line.ticked ? restockText(line.restock, line.baseUnit, system, { compact: true }) : '',
  }
}

export function extraEntry(extra: ShoppingExtra, system: UnitSystem): ListEntry {
  const hasAmount = extra.quantity !== null && extra.baseUnit !== null
  return {
    key: `extra:${extra.id}`,
    kind: 'extra',
    ingredientId: extra.ingredientId,
    extraId: extra.id,
    title: extra.text ?? (extra.name ? displayName(extra.name) : ''),
    detail: hasAmount ? formatQuantity(extra.quantity ?? 0, extra.baseUnit ?? 'piece', system) : '',
    quantityText: hasAmount ? formatQuantity(extra.quantity ?? 0, extra.baseUnit ?? 'piece', system) : '',
    packLine: '',
    estimatedCost: null,
    ticked: extra.ticked,
    quantity: hasAmount && !extra.ticked ? (extra.quantity ?? 0) : 0,
    baseUnit: extra.baseUnit,
    imageUrl: extra.imageUrl,
    supply: extra.kind === 'supply',
    restockText: '',
    restockCompact: '',
  }
}

/** Open entries first (Lines in server order, then extras), then ticked ones (the "Ticked" group), in the same order. */
export function listEntries(list: ShoppingList, system: UnitSystem): { open: ListEntry[]; ticked: ListEntry[] } {
  const lines = list.lines.map((l) => lineEntry(l, list.currency, system))
  const extras = list.extras.map((e) => extraEntry(e, system))
  const all = [...lines.filter((i) => !i.ticked), ...extras.filter((i) => !i.ticked)]
  const ticked = [...lines.filter((i) => i.ticked), ...extras.filter((i) => i.ticked)]
  return { open: all, ticked }
}

/**
 * B5-SH: the hint of a Line that includes Planned Meals whose slot has passed and that are not marked Cooked or Not
 * cooked yet. '' without any. Courses of one slot are grouped:
 * - one slot, one Course: "Includes Tue Dinner, not marked Cooked yet"
 * - one slot, several Courses: "Includes Tue Dinner (Main, Side), not marked Cooked yet"
 * - several slots, oldest first: "Includes Tue Dinner and Wed Lunch, ..." / "Includes Mon Dinner, Tue Dinner and Wed Lunch, ..."
 * The weekday is the short English name of the entry's date.
 */
export function pastMealsHint(meals: PastPlannedMeal[] | undefined): string {
  if (!meals || meals.length === 0) return ''
  return shopStrings.unconfirmedMeals(slotsLabel(meals))
}

/**
 * b8-shop: the one-line hint of a row: the oldest slot, then "+n" for the other slots ("Tue Dinner +1"), so the text fits the text
 * column of a 360 px row and of a card in the 3-column grid (P23). Courses do not count; the sheet's full hint keeps every slot. ''
 * without meals.
 */
export function shortHint(meals: PastPlannedMeal[] | undefined): string {
  if (!meals || meals.length === 0) return ''
  const oldest = [...meals].sort((a, b) => a.date.localeCompare(b.date) || a.mealSlotId - b.mealSlotId)[0]!
  const slots = new Set(meals.map((m) => `${m.date}|${m.mealSlotId}`)).size
  const first = slotsLabel([oldest], false)
  return slots > 1 ? shopStrings.slotMore(first, slots - 1) : first
}

/** B5-F1: the oldest slot among the unconfirmed past meals (by date, then Meal Slot id); null without any. */
export function markItTarget(meals: PastPlannedMeal[] | undefined): { date: string; mealSlotId: number } | null {
  if (!meals || meals.length === 0) return null
  const first = [...meals].sort((a, b) => a.date.localeCompare(b.date) || a.mealSlotId - b.mealSlotId)[0]!
  return { date: first.date, mealSlotId: first.mealSlotId }
}

/** B5-SH: the entries of the collapsed "Not needed" group (list.notNeeded, in server order); [] for an older saved list. */
export function notNeededEntries(list: ShoppingList, system: UnitSystem): ListEntry[] {
  return (list.notNeeded ?? []).map((line) => lineEntry(line, list.currency, system))
}
