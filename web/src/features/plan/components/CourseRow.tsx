import type { ReactNode } from 'react'
import type { CourseRowModel } from '../lib/courses'
import type { PlanSlot, SlotKey } from '../types'

export type CourseAction = 'swap' | 'pin' | 'cooked'

/** What a Course row can do; every handler gets the key of that Course's Planned Meal (courseId included). */
export interface CourseRowHandlers {
  /** The Recipe name is a button that opens the Planned Meal sheet of the Course. */
  onOpen: (key: SlotKey) => void
  onSwap?: (key: SlotKey) => void
  onPin?: (key: SlotKey) => void
  onUnpin?: (key: SlotKey) => void
  /** Opens the Mark as Cooked sheet of the Course. */
  onMarkCooked?: (key: SlotKey) => void
  /** An empty row's "Choose a Recipe". */
  onChoose?: (key: SlotKey) => void
}

export interface CourseRowProps extends CourseRowHandlers {
  row: CourseRowModel
  slot: PlanSlot
  /** Household date: Mark as Cooked is offered for today and past only (lib/resolve mayResolve). */
  today: string
  /** Which icon buttons the row offers, in this order, on a planned meal. Default ['swap']. */
  actions?: CourseAction[]
  /** The small row of Today's hero block and of the 7-column week. */
  compact?: boolean
}

/**
 * STUB (CRS F). One Course of a slot block: `<li aria-label="{Course name}">` with the caption (row.caption), the Recipe
 * name as a button, one day chip (lib/chips dayChip, as the single meal) plus the "Whole meal" chip (lib/courses
 * wholeMealChip), and compact IconButtons named "Swap", "Pin" or "Unpin" and "Mark as Cooked" for a planned meal, per
 * `actions` (Mark as Cooked only when mayResolve). An empty row (no meal) is the dashed "Not planned" block of MealTile
 * with "Choose a Recipe". Cooked and Not cooked rows are muted and have no buttons.
 */
export function CourseRow(_props: CourseRowProps): ReactNode {
  return null
}
