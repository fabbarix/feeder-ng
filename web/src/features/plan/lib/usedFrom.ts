// Used from (ADR 0011, docs/dev/design/b5-ufw.md): pure picking maths, summary copy, payload. No React.
import { formatQuantity, type BaseUnit, type UnitSystem } from '../../../lib/units'
import { usedFromStrings } from '../usedFromStrings'
import { dateRange } from './days'

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
}

export interface CourseSelection {
  courseId: number
  needs: UsedFromNeed[]
  selection: Selection
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
  const amount = remaining > 0 ? Math.min(lot.quantity, remaining) : lot.quantity
  return withAmount(selection, need.ingredientId, lotId, amount)
}

/** Sets a picked Lot's amount, clamped to 0..Lot quantity; ignored for a Lot that is not picked. */
export function setPickAmount(selection: Selection, need: UsedFromNeed, lotId: number, amount: number): Selection {
  const lot = need.lots.find((l) => l.id === lotId)
  if (!lot || amountOf(selection, need.ingredientId, lotId) === undefined || !Number.isFinite(amount)) return selection
  return withAmount(selection, need.ingredientId, lotId, Math.min(Math.max(amount, 0), lot.quantity))
}

export function lineState(need: UsedFromNeed, selection: Selection): LineState {
  const total = pickedTotal(selection, need.ingredientId)
  if (total <= 0) return 'none'
  if (total < need.quantity) return 'short'
  if (total === need.quantity) return 'exact'
  return 'over'
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
        }
        row.picked += amount
        if (!row.courseIds.includes(course.courseId)) row.courseIds.push(course.courseId)
        byLot.set(lot.id, row)
      }
    }
  }
  return [...byLot.values()].filter((row) => row.picked > row.held)
}

const shortDate = (date: string) => dateRange(date, date)

export function usedFromLines(needs: UsedFromNeed[], selection: Selection, system: UnitSystem = 'metric'): LineView[] {
  return needs.map((need) => {
    const quantity = (amount: number) => formatQuantity(amount, need.baseUnit, system)
    const state = lineState(need, selection)
    const total = pickedTotal(selection, need.ingredientId)
    let message: string | null = null
    if (state === 'short') message = usedFromStrings.short(quantity(total), quantity(need.quantity))
    if (state === 'over') message = usedFromStrings.over(quantity(total), quantity(need.quantity))
    const lots: LotView[] = need.lots.map((lot) => {
      const amount = amountOf(selection, need.ingredientId, lot.id)
      const goesOff = lot.goesOff ? usedFromStrings.goesOff(shortDate(lot.goesOff)) : usedFromStrings.noGoOff
      return {
        lotId: lot.id,
        label: usedFromStrings.lotLabel(quantity(lot.quantity), lot.storagePlaceName),
        meta: `${goesOff} · ${usedFromStrings.bought(shortDate(lot.purchased))}`,
        picked: amount !== undefined,
        amount: amount ?? 0,
        max: lot.quantity,
        amountLabel: usedFromStrings.amountLabel(lot.storagePlaceName),
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
