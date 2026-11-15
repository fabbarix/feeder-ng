// ds-plan: which icon actions a Course row and a Meal Slot header offer. Plain TypeScript, no React.
import { mayCook } from './resolve'
import { plannedMeals, slotMenu } from './courses'
import type { PlannedMeal, PlanSlot } from '../types'

export type RowAction = 'swap' | 'pin' | 'unpin'

/** The icon actions at the end of a Course row, in this fixed order; none for a Cooked, Not cooked or empty row. */
export function rowActions(meal: PlannedMeal | null): RowAction[] {
  if (!meal || meal.state !== 'planned') return []
  return ['swap', meal.pinned ? 'unpin' : 'pin']
}

export interface SlotHeadModel {
  /** The Cook icon (today's planned meal only). */
  cook: boolean
  /** The ⋮ menu (lib/courses slotMenu is not null). */
  menu: boolean
}

/** The actions of a Meal Slot header: Cook for today's planned meal, and the ⋮ menu when the slot has entries for it. */
export function slotHead(slot: PlanSlot, today: string, hasDateActions: boolean): SlotHeadModel {
  return {
    cook: plannedMeals(slot).length > 0 && mayCook(slot.date, today),
    menu: slotMenu(slot, today, hasDateActions) !== null,
  }
}

// B9-38 (PC-09, SHORT-02): the footer of the Planned Meal sheet.
export type SheetActionId = 'cook' | 'reheat' | 'markCooked' | 'notCooked' | 'swap' | 'pin' | 'unpin' | 'choose' | 'undoCooked' | 'cookedAfterAll' | 'undoNotCooked'

export interface SheetAction {
  id: SheetActionId
  /** A ⋮ item that cannot be used yet (Mark as Cooked on a future date). */
  disabled?: boolean
  /** Why it is disabled, as the item's trailing words: "from Mon 16". */
  note?: string
}

export interface SheetActionSet {
  /** The one primary Button of the footer; null when the state has none. */
  primary: SheetAction | null
  /** The one outlined secondary Button; null when the state has none. */
  secondary: SheetAction | null
  /** The items of the footer's ⋮ "More for <Sun Dinner>", in order. */
  more: SheetAction[]
}

/** What the Planned Meal sheet's footer offers for a meal on `date` (household dates). Never more than a primary and a secondary button. */
export function sheetActions(_meal: PlannedMeal, _ctx: { date: string; today: string; offline?: boolean }): SheetActionSet {
  throw new Error('sheetActions: not implemented (B9-38)')
}
