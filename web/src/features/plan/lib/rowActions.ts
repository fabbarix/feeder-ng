// ds-plan: which icon actions a row and a slot header offer. Plain TypeScript, no React. Stub: the developer implements it.
import type { PlannedMeal, PlanSlot } from '../types'

export type RowAction = 'swap' | 'pin' | 'unpin'

/** The icon actions at the end of a Course row, in this fixed order; none for a Cooked, Not cooked or empty row. */
export function rowActions(_meal: PlannedMeal | null): RowAction[] {
  throw new Error('ds-plan: rowActions is not implemented')
}

export interface SlotHeadModel {
  /** The Cook icon (today's planned meal only). */
  cook: boolean
  /** The ⋮ menu (lib/courses slotMenu is not null). */
  menu: boolean
}

export function slotHead(_slot: PlanSlot, _today: string, _hasDateActions: boolean): SlotHeadModel {
  throw new Error('ds-plan: slotHead is not implemented')
}
