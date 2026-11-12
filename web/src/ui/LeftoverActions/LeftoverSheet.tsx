// The Had it / Threw it out / Freeze it / Take out sheet (BottomSheet + StepperField + Select). STUB (red).
import type { Leftover, LeftoverActionKind, LeftoverClaim, LeftoverPlace, LeftoverRequest } from '../../lib/leftovers'

export interface LeftoverSheetProps {
  /** Which sheet; null = closed. */
  action: LeftoverActionKind | null
  leftover: Leftover
  today: string
  storagePlaces: LeftoverPlace[]
  /** The Recipe's Frozen Use-by, else null (the Household's applies). */
  recipeFrozenUseBy: number | null
  householdFrozenUseBy: number
  /** The Recipe's Use-by days (Take out). */
  recipeUseByDays: number
  /** Planned Meals served from this Leftover, soonest first. */
  claims: LeftoverClaim[]
  busy?: boolean
  onConfirm: (request: LeftoverRequest) => void
  onClose: () => void
  /** "Storage Places" link of the no-Freezer state (the parent navigates to Settings > Storage Places). */
  storagePlacesHref?: string
}

export function LeftoverSheet(_props: LeftoverSheetProps) {
  return null
}
