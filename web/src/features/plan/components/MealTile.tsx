import type { ReactNode } from 'react'
import type { PlanSlot, SlotKey } from '../types'
import '../plan.css'

export interface MealTileProps {
  slot: PlanSlot
  /** Household date: the Cook icon is offered for today's planned meal only (lib/resolve mayCook). */
  today: string
  /** Opens the Planned Meal sheet (the Recipe name is the button). */
  onOpen: (key: SlotKey) => void
  onSwap: (key: SlotKey) => void
  onChoose: (key: SlotKey) => void
  /** B2: Cook Mode from the tile. */
  onCook: (key: SlotKey) => void
}

/**
 * One Planned Meal inside a day tile (ui-fix-plan 5.2), compact: row 1 = Meal Slot icon and name, trailing compact
 * IconButtons "Swap" (planned meals) and "Cook" (today's planned meal); row 2 = the Recipe name as a button that opens
 * the sheet (2-line clamp); row 3 = at most ONE chip (lib/chips dayChip). Cooked and Not cooked meals are muted
 * (data-state) and have no icon buttons. An empty slot is a dashed block (data-unfilled) with a danger chip
 * "Couldn't plan", the reason text and a tertiary "Choose a Recipe". No Mark as Cooked, Pin or Confirm here: the sheet has them.
 */
export function MealTile(_props: MealTileProps): ReactNode {
  throw new Error('not implemented (WP6)')
}
