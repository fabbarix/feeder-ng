import type { ReactNode } from 'react'

/**
 * Route /plan. A BentoGrid of two columns: a DayTile per day, today spanning both. Swap opens the SwapSheet, Mark as
 * Cooked the MarkCookedSheet (then ShortfallNotice and StockCorrectionSheet), an empty slot offers a Recipe to set.
 * "Regenerate" redoes the unpinned meals; a small note shows while the planner is updating. Composition only: the
 * logic lives in hooks/ and lib/.
 */
export function PlanScreen(): ReactNode {
  return null
}
