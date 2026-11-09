import type { ReactNode } from 'react'
import type { PlanSlot, SlotKey } from '../types'

export interface MealTileProps {
  slot: PlanSlot
  onSwap: (key: SlotKey) => void
  onChoose: (key: SlotKey) => void
  onConfirm: (key: SlotKey) => void
  onUnpin: (key: SlotKey) => void
  onMarkCooked: (key: SlotKey) => void
}

/**
 * One Planned Meal in a Meal Slot: Recipe, Batches, portions, phrased why chips, state (Pinned, Leftover, Cooked,
 * not cooked) and the actions that fit the state. An empty slot shows its "couldn't plan" reason and "Choose a Recipe".
 * Renders and wires events only; the wording comes from lib/.
 */
export function MealTile(props: MealTileProps): ReactNode {
  void props
  return null
}
