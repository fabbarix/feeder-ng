// SET-15: the "Removed Meal Slots" tile under the cards. Stub: the developer builds it (B9-42).
import type { RemovedMealSlotGroup, RemovedRow } from '../lib/removedMealSlots'

export interface RemovedMealSlotsProps {
  /** The answer of `GET /api/meal-slots?removed=with-history`. The tile is not drawn for an empty list. */
  groups: readonly RemovedMealSlotGroup[]
  /** An Admin gets "Put back"; a plain User sees the tile without it. */
  canRestore: boolean
  /** The key of the row being put back (its button is busy and every Put back is disabled meanwhile). */
  busyKey?: string | null
  locale?: string
  onPutBack: (row: RemovedRow) => void
}

export function RemovedMealSlots(_props: RemovedMealSlotsProps) {
  return null
}
