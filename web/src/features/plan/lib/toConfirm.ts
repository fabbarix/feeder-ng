// CRS F: To confirm groups a slot's Courses under one heading, and Mark all Cooked builds its body. STUBS.
import type { CookedAllEntry, PlanSlot, SlotKey } from '../types'

const TODO = (): never => {
  throw new Error('CRS F: not implemented')
}

export interface ToConfirmGroup {
  /** `{ date, mealSlotId }`: the slot, for Mark all Cooked. */
  slot: SlotKey
  /** One Course: the Recipe name as before. Several: "Tue Dinner: Roast chicken, Green beans". */
  heading: string
  /** The flat entries of the slot, in the order given. */
  entries: PlanSlot[]
}

/**
 * Groups the flat to-confirm entries (one per Course) by date and Meal Slot, keeping the order of first appearance.
 * A group with one entry has the Recipe name as heading and keeps the old "Tue Dinner" line; a group with several
 * entries has the heading "<Tue> <Dinner>: <Recipe>, <Recipe>" (short weekday, slot name, Recipe names in entry order).
 */
export function groupToConfirm(_entries: PlanSlot[]): ToConfirmGroup[] {
  return TODO()
}

/** A fresh Course of the Mark all Cooked sheet, with its edited Leftover; a Leftover Course has `fresh: false`. */
export interface AllCookedRow {
  courseId: number
  courseName: string
  recipeName: string
  fresh: boolean
  proposedLeftover: number
  maxLeftover: number
  leftover: number
  leftoverUseBy: string
}

/**
 * The body of POST .../all/cooked: one `{ courseId, leftoverPortions }` per FRESH row, in row order, with the edited
 * Leftover; a Leftover Course (fresh false) is left out (it has no Leftover to record).
 */
export function allCookedBody(_rows: AllCookedRow[]): CookedAllEntry[] {
  return TODO()
}
