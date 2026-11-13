// Used from (ADR 0011, docs/dev/design/b5-ufw.md): pure picking maths, summary copy, payload. No React.
import { formatQuantity, type BaseUnit, type UnitSystem } from '../../../lib/units'
import { describeGoOff } from '../../stock/lib/view'
import { usedFromStrings } from '../usedFromStrings'
import { dateRange } from './days'

/** Totals compare with this slack, so 0.1 + 0.2 is not over 0.3. */
const EPSILON = 1e-9

export interface UsedFromLot {
  id: number
  quantity: number
  purchased: string
  goesOff: string | null
  storagePlaceName: string
}

export interface UsedFromNeed {
  ingredientId: number
  ingredient: string
  quantity: number
  /** Sent by the server on each need (Base Unit of the Ingredient); required, there is no default unit. */
  baseUnit: BaseUnit
  /** In Deduction order, as the cook preview sends them. */
  lots: UsedFromLot[]
}

export interface UsedFromPick {
  lotId: number
  quantity: number
}

export interface UsedFromEntry {
  ingredientId: number
  lots: UsedFromPick[]
}

/** The picked amounts of one Course: ingredientId -> lotId -> amount. A Lot absent from the map is not picked. */
export type Selection = Record<number, Record<number, number>>

export type LineState = 'none' | 'short' | 'exact' | 'over'

export interface LotView {
  lotId: number
  label: string
  meta: string
  picked: boolean
  amount: number
  max: number
  /** The Base Unit of the Ingredient, the NumberField suffix. */
  unit: BaseUnit
  amountLabel: string
}

export interface LineView {
  ingredientId: number
  title: string
  state: LineState
  /** Short/over message; null otherwise. */
  message: string | null
  lots: LotView[]
  /** The no-Lots notice; null when there are Lots. */
  empty: string | null
}

export interface LotConflict {
  lotId: number
  ingredientId: number
  ingredient: string
  storagePlaceName: string
  held: number
  picked: number
  courseIds: number[]
  purchased: string
  baseUnit: BaseUnit
}

export interface CourseSelection {
  courseId: number
  needs: UsedFromNeed[]
  selection: Selection
}

/** The Storage Place as shown: "Not sorted" for a Lot in no place. */
export function storagePlaceLabel(storagePlaceName: string): string {
  return storagePlaceName.trim() === '' ? usedFromStrings.unsorted : storagePlaceName
}

/** The picked amount of a Lot, or undefined when it is not picked. */
function amountOf(selection: Selection, ingredientId: number, lotId: number): number | undefined {
  return selection[ingredientId]?.[lotId]
}

function withAmount(selection: Selection, ingredientId: number, lotId: number, amount: number): Selection {
  return { ...selection, [ingredientId]: { ...(selection[ingredientId] ?? {}), [lotId]: amount } }
}

function withoutPick(selection: Selection, ingredientId: number, lotId: number): Selection {
  const lots = { ...(selection[ingredientId] ?? {}) }
  delete lots[lotId]
  const next = { ...selection }
  if (Object.keys(lots).length === 0) delete next[ingredientId]
  else next[ingredientId] = lots
  return next
}

export function pickedTotal(selection: Selection, ingredientId: number): number {
  return Object.values(selection[ingredientId] ?? {}).reduce((sum, amount) => sum + amount, 0)
}

/** Ticks or unticks a Lot; ticking prefills the amount in pick order up to the need. */
export function togglePick(selection: Selection, need: UsedFromNeed, lotId: number, on: boolean): Selection {
  const lot = need.lots.find((l) => l.id === lotId)
  if (!lot) return selection
  const picked = amountOf(selection, need.ingredientId, lotId) !== undefined
  if (!on) return picked ? withoutPick(selection, need.ingredientId, lotId) : selection
  if (picked) return selection
  // The Lots already picked for this Ingredient count against the need; once it is covered, the Lot is taken whole.
  const remaining = need.quantity - pickedTotal(selection, need.ingredientId)
  const amount = remaining > EPSILON ? Math.min(lot.quantity, remaining) : lot.quantity
  return withAmount(selection, need.ingredientId, lotId, amount)
}

/**
 * Sets a picked Lot's amount, clamped to 0..Lot quantity. `null` clears the pick (the Lot is unticked). Ignored for a Lot
 * that is not picked.
 */
export function setPickAmount(selection: Selection, need: UsedFromNeed, lotId: number, amount: number | null): Selection {
  const lot = need.lots.find((l) => l.id === lotId)
  if (!lot || amountOf(selection, need.ingredientId, lotId) === undefined) return selection
  if (amount === null) return withoutPick(selection, need.ingredientId, lotId)
  if (!Number.isFinite(amount)) return selection
  return withAmount(selection, need.ingredientId, lotId, Math.min(Math.max(amount, 0), lot.quantity))
}

export function lineState(need: UsedFromNeed, selection: Selection): LineState {
  const total = pickedTotal(selection, need.ingredientId)
  if (total <= EPSILON) return 'none'
  if (Math.abs(total - need.quantity) <= EPSILON) return 'exact'
  return total < need.quantity ? 'short' : 'over'
}

export function usedFromSummary(needs: UsedFromNeed[], selection: Selection): string {
  const chosen = needs.filter((need) => lineState(need, selection) !== 'none').length
  return chosen === 0 ? usedFromStrings.summaryDefault : usedFromStrings.summaryChosen(chosen)
}

/** The request payload; undefined when nothing is picked (zero amounts do not count). */
export function toUsedFrom(needs: UsedFromNeed[], selection: Selection): UsedFromEntry[] | undefined {
  const entries: UsedFromEntry[] = []
  for (const need of needs) {
    const lots: UsedFromPick[] = []
    for (const lot of need.lots) {
      const amount = amountOf(selection, need.ingredientId, lot.id)
      if (amount !== undefined && amount > 0) lots.push({ lotId: lot.id, quantity: amount })
    }
    if (lots.length > 0) entries.push({ ingredientId: need.ingredientId, lots })
  }
  return entries.length > 0 ? entries : undefined
}

/** Lots whose picks across the Courses together exceed what they hold (Mark all Cooked). */
export function overPickedLots(courses: CourseSelection[]): LotConflict[] {
  const byLot = new Map<number, LotConflict>()
  for (const course of courses) {
    for (const need of course.needs) {
      for (const lot of need.lots) {
        const amount = amountOf(course.selection, need.ingredientId, lot.id)
        if (amount === undefined || amount <= 0) continue
        const row: LotConflict = byLot.get(lot.id) ?? {
          lotId: lot.id,
          ingredientId: need.ingredientId,
          ingredient: need.ingredient,
          storagePlaceName: lot.storagePlaceName,
          held: lot.quantity,
          picked: 0,
          courseIds: [],
          purchased: lot.purchased,
          baseUnit: need.baseUnit,
        }
        row.picked += amount
        if (!row.courseIds.includes(course.courseId)) row.courseIds.push(course.courseId)
        byLot.set(lot.id, row)
      }
    }
  }
  return [...byLot.values()].filter((row) => row.picked > row.held + EPSILON)
}

/**
 * One message per conflicting Lot, keyed by lotId. The message names the Lot by its quantity and Storage Place; the
 * Bought date is added only when another conflicting Lot in the same place has the same quantity.
 */
export function conflictMessages(conflicts: LotConflict[], system: UnitSystem): Record<number, string> {
  const out: Record<number, string> = {}
  for (const row of conflicts) {
    const twins = conflicts.filter(
      (other) => other.ingredientId === row.ingredientId && other.storagePlaceName === row.storagePlaceName && other.held === row.held,
    )
    const bought = twins.length > 1 ? dateRange(row.purchased, row.purchased) : undefined
    out[row.lotId] = usedFromStrings.conflict(
      row.ingredient,
      formatQuantity(row.held, row.baseUnit, system),
      storagePlaceLabel(row.storagePlaceName),
      bought,
    )
  }
  return out
}

const shortDate = (date: string) => dateRange(date, date)

export function usedFromLines(needs: UsedFromNeed[], selection: Selection, system: UnitSystem, today: string): LineView[] {
  return needs.map((need) => {
    const quantity = (amount: number) => formatQuantity(amount, need.baseUnit, system)
    const state = lineState(need, selection)
    const total = pickedTotal(selection, need.ingredientId)
    let message: string | null = null
    if (state === 'short') message = usedFromStrings.short(quantity(total), quantity(need.quantity))
    if (state === 'over') message = usedFromStrings.over(quantity(total), quantity(need.quantity))
    const lots: LotView[] = need.lots.map((lot) => {
      const amount = amountOf(selection, need.ingredientId, lot.id)
      const goOff = describeGoOff({ goesOff: lot.goesOff, spoiled: false, useSoon: false }, today).label
      const place = storagePlaceLabel(lot.storagePlaceName)
      return {
        lotId: lot.id,
        label: usedFromStrings.lotLabel(quantity(lot.quantity), place),
        meta: `${goOff} · ${usedFromStrings.bought(shortDate(lot.purchased))}`,
        picked: amount !== undefined,
        amount: amount ?? 0,
        max: lot.quantity,
        unit: need.baseUnit,
        amountLabel: usedFromStrings.amountLabel(place),
      }
    })
    return {
      ingredientId: need.ingredientId,
      title: usedFromStrings.lineTitle(need.ingredient, quantity(need.quantity)),
      state,
      message,
      lots,
      empty: lots.length === 0 ? usedFromStrings.noLots : null,
    }
  })
}
