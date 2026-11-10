import type { ReactNode } from 'react'
import { Tile } from '../../../ui'
import { couldntPlanText } from '../lib/couldnt'
import type { Leftover, PlanSlot, SlotKey } from '../types'
import '../plan.css'

export interface ToConfirmTileProps {
  slots: PlanSlot[]
  /** "Yes, Cooked": one tap, planned Leftover portions. */
  onYesCooked: (key: SlotKey) => void
  /** "Adjust": the Mark as Cooked sheet. */
  onAdjust: (key: SlotKey) => void
  onNotCooked: (key: SlotKey) => void
}

/**
 * Today: Planned Meals still unconfirmed two hours after their slot time. Tile variant surface, span full, h2 "To
 * confirm", per meal the Recipe name and slot line with secondary "Yes, Cooked" and "Adjust" and tertiary "Not cooked".
 * Renders nothing when there are none.
 */
export function ToConfirmTile(_props: ToConfirmTileProps): ReactNode {
  throw new Error('not implemented (WP6)')
}

export interface CouldntPlanNoticeProps {
  slots: PlanSlot[]
}

/** Today: "Couldn't plan Thursday dinner: ..." for each slot the planner left empty. Renders nothing when there are none. */
export function CouldntPlanNotice({ slots }: CouldntPlanNoticeProps): ReactNode {
  if (slots.length === 0) return null
  return (
    <Tile size="full" tone="spoil" role="status">
      <ul className="plan__list">
        {slots.map((s) => (
          <li key={`${s.date}/${s.mealSlotId}`}>{couldntPlanText(s)}</li>
        ))}
      </ul>
    </Tile>
  )
}

export interface LeftoversTileProps {
  leftovers: Leftover[]
  today: string
  /** Makes the whole tile open the Plan (stretched target named "Leftovers to use"). */
  onOpen?: () => void
}

/**
 * Today: the Leftovers to use, soonest Use-by first. Half tile, variant status leftover, overline "LEFTOVERS" with the
 * leftover icon, a row per Leftover "Chicken curry" with meta "2 portions · Use by Thu" (the spoil tone when due
 * today or tomorrow). Renders nothing when there are none.
 */
export function LeftoversTile(_props: LeftoversTileProps): ReactNode {
  throw new Error('not implemented (WP6)')
}
