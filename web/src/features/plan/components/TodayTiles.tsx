import type { ReactNode } from 'react'
import type { Leftover, PlanSlot, SlotKey } from '../types'

export interface NextMealTileProps {
  /** From lib/days.nextMeal; null shows "Nothing planned". */
  slot: PlanSlot | null
  onOpen?: (key: SlotKey) => void
}

/** Today: the next meal to cook, with its Recipe, Meal Slot, time and first why chip. */
export function NextMealTile(props: NextMealTileProps): ReactNode {
  void props
  return null
}

export interface ToConfirmTileProps {
  slots: PlanSlot[]
  onCooked: (key: SlotKey) => void
  onNotCooked: (key: SlotKey) => void
}

/** Today: meals still unconfirmed two hours after their slot time. Renders nothing when there are none. */
export function ToConfirmTile(props: ToConfirmTileProps): ReactNode {
  void props
  return null
}

export interface CouldntPlanNoticeProps {
  slots: PlanSlot[]
}

/** Today: "Couldn't plan Thursday dinner: ..." for each slot the planner left empty. Renders nothing when there are none. */
export function CouldntPlanNotice(props: CouldntPlanNoticeProps): ReactNode {
  void props
  return null
}

export interface LeftoversTileProps {
  leftovers: Leftover[]
  today: string
}

/** Today: the Leftovers to use, soonest Use-by first. Renders nothing when there are none. */
export function LeftoversTile(props: LeftoversTileProps): ReactNode {
  void props
  return null
}
