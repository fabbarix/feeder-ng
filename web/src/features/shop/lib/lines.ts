// Presentation helpers for the Shopping List (no React).
import { formatMinor } from '../../products/lib/money'
import { displayName } from '../../ingredients/lib/names'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { defaultTickAmount, tickedMeta, type TickedMeta } from './tickAmount'
import type { BaseUnit, LineTick, PastPlannedMeal, ShoppingExtra, ShoppingLine, ShoppingList } from '../types'
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
  /** "1.4 kg · 2 × Mutti 700 g", "1.4 kg", "2 l" or "" for free text (the Scan live list shows this) */
  detail: string
  /** the quantity of the tile ("1.4 kg", "2 l"); "" for free text and ticked entries (WP7) */
  quantityText: string
  /** the muted pack line ("2 × Mutti 700 g"); "" when there is no pack suggestion or the entry is ticked (WP7) */
  packLine: string
  /**
   * B9-34 (SSP-05, P23): the pack line's compact form for a narrow text column: the count and the pack size ("2 × 700 g"), so a long
   * Product name is never what a card row cuts; "" with no pack line.
   */
  packCompact?: string
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
  /**
   * B9-34 (SSP-01, SSP-02): the amount one tap ticks with, in Base Units (lib/tickAmount defaultTickAmount): the suggested pack
   * (count x size, the priced fallback included), else what the entry still needs; 0 for free text. A More entry is its `more`.
   */
  defaultAmount?: number
  /**
   * B9-34: the Change sheet's "What the Line needed": an open Line's quantity still to get (what one tap would have had to cover), a
   * ticked Line's need (the server's `need`: its quantity left is 0). An Ingredient extra's own quantity; 0 for free text.
   */
  need?: number
  /** B9-34: the suggested pack as the Change sheet's chip says it ("1 × Garlic organic pack", 500 g each pack); null without one. */
  packChoice?: { count: number; name: string; size: number } | null
  /** B9-34: the tick of a ticked entry, as the list sent it (the Line sheet's additions); null while open. */
  tick?: LineTick | null
  /** B9-34 (SSP-01): what a ticked entry's meta line says (lib/tickAmount tickedMeta); null while open or without a tick. */
  tickMeta?: TickedMeta | null
  /** B9-34 (SSP-02): true on the open entry "more:<ingredientId>" that carries a ticked Line's growth. */
  moreSince?: boolean
}

/** "1.4 kg · 2 × Mutti 700 g" (quantity via formatQuantity, then packs); just "1.4 kg" with no pack suggestion. */
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
    packCompact: line.ticked || !line.pack ? '' : `${line.pack.count} × ${formatQuantity(line.pack.size, line.baseUnit, system)}`,
    estimatedCost: priceText(line.estimatedCostCents, currency),
    ticked: line.ticked,
    quantity: line.ticked ? 0 : line.quantity,
    baseUnit: line.baseUnit,
    imageUrl: line.imageUrl,
    supply: line.kind === 'supply',
    restockText: line.kind === 'supply' && line.restock && !line.ticked ? restockText(line.restock, line.baseUnit, system) : '',
    restockCompact:
      line.kind === 'supply' && line.restock && !line.ticked ? restockText(line.restock, line.baseUnit, system, { compact: true }) : '',
    defaultAmount: defaultTickAmount(line),
    // "What the Line needed" (the Change sheet): what was still to get when it was ticked; a ticked Line, the server's need
    need: line.ticked ? line.need : line.quantity,
    packChoice: line.pack ? { count: line.pack.count, name: line.pack.name, size: line.pack.size } : null,
    tick: line.tick ?? null,
    tickMeta: line.ticked ? tickedMeta(line.tick, line.baseUnit, system) : null,
    moreSince: false,
  }
}

/**
 * SSP-02 (decision SSP 3): the open entry "more:<ingredientId>" of a ticked Line whose need grew after the tick and is not covered yet
 * (`more` > 0); null for any other Line. It is a real Line row for the difference: its quantity, pack suggestion and estimate are what the
 * server sent for it, and one tap ticks the difference (the server covers the More with that tick). Its ticked entry stays in Ticked.
 */
export function moreEntryOf(line: ShoppingLine, currency: string, system: UnitSystem): ListEntry | null {
  const more = line.more ?? 0
  if (!line.ticked || more <= 0) return null
  const open = lineEntry({ ...line, ticked: false, tick: null, quantity: more, restock: null }, currency, system)
  return { ...open, key: `more:${line.ingredientId}`, moreSince: true, defaultAmount: defaultTickAmount({ ...line, quantity: more }) }
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
    defaultAmount: hasAmount ? (extra.quantity ?? 0) : 0,
    need: hasAmount ? (extra.quantity ?? 0) : 0,
    packChoice: null,
    tick: extra.tick ?? null,
    tickMeta: extra.ticked ? tickedMeta(extra.tick, extra.baseUnit ?? 'piece', system) : null,
    moreSince: false,
  }
}

/**
 * Open entries first (Lines in server order, then extras), then ticked ones (the "Ticked" group), in the same order. A ticked Line whose
 * need grew (SSP-02) also puts its "more:<id>" entry among the open Lines, where the Line sits in server order.
 */
export function listEntries(list: ShoppingList, system: UnitSystem): { open: ListEntry[]; ticked: ListEntry[] } {
  const lines = list.lines.map((l) => lineEntry(l, list.currency, system))
  const extras = list.extras.map((e) => extraEntry(e, system))
  const openLines = list.lines.flatMap((l, i) => (l.ticked ? [moreEntryOf(l, list.currency, system)].filter((e): e is ListEntry => e !== null) : [lines[i]!]))
  const all = [...openLines, ...extras.filter((i) => !i.ticked)]
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
