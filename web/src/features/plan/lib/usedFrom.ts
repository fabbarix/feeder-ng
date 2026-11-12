// Used from (ADR 0011, docs/dev/design/b5-ufw.md): pure picking maths, summary copy, payload. No React.
import type { BaseUnit, UnitSystem } from '../../../lib/units'

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
  baseUnit?: BaseUnit
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

export function pickedTotal(_selection: Selection, _ingredientId: number): number {
  return Number.NaN
}

/** Ticks or unticks a Lot; ticking prefills the amount in pick order up to the need. */
export function togglePick(selection: Selection, _need: UsedFromNeed, _lotId: number, _on: boolean): Selection {
  return selection
}

/** Sets a picked Lot's amount, clamped to 0..Lot quantity; ignored for a Lot that is not picked. */
export function setPickAmount(selection: Selection, _need: UsedFromNeed, _lotId: number, _amount: number): Selection {
  return selection
}

export function lineState(_need: UsedFromNeed, _selection: Selection): LineState {
  return 'exact'
}

export function usedFromSummary(_needs: UsedFromNeed[], _selection: Selection): string {
  return ''
}

/** The request payload; undefined when nothing is picked (zero amounts do not count). */
export function toUsedFrom(_needs: UsedFromNeed[], _selection: Selection): UsedFromEntry[] | undefined {
  return [{ ingredientId: -1, lots: [] }]
}

/** Lots whose picks across the Courses together exceed what they hold (Mark all Cooked). */
export function overPickedLots(_courses: CourseSelection[]): LotConflict[] {
  return [{ lotId: -1, ingredientId: -1, ingredient: '', storagePlaceName: '', held: 0, picked: 0, courseIds: [] }]
}

export function usedFromLines(_needs: UsedFromNeed[], _selection: Selection, _system: UnitSystem = 'metric'): LineView[] {
  return []
}
