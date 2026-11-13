import type { ReactNode } from 'react'
import type { PlanSlot, SlotDayKey } from '../types'

export interface NotServedRowProps {
  slot: PlanSlot
  /** Offline: "Plan Dinner again" is disabled and says "Needs a connection". */
  offline?: boolean
  onPlanAgain: (slot: SlotDayKey) => void
}

/** The compact row of a Not served slot: "Dinner · Not served" and a "Plan Dinner again" button. No Courses, no why chips, no Couldn't plan. */
export function NotServedRow(_props: NotServedRowProps): ReactNode {
  return null
}
