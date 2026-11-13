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
