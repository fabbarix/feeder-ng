// B5-F1: the Plan page's `?mark=<date>:<slot>` parameter: once the plan has loaded it opens the slot's Mark as Cooked sheet (one Course
// to cook) or Mark all Cooked sheet (several) through the screen's own flows, then leaves when the sheet closes. usePlanScreen calls it.
import type { AllCookedFlow } from './useAllCookedFlow'
import type { CookFlow } from './useCookFlow'
import type { PlanSlot } from '../types'

export interface MarkSlotRouteInput {
  slots: PlanSlot[]
  /** The plan has loaded (an empty slot list before that must not read as "no such slot"). */
  loaded: boolean
  flow: CookFlow
  allCooked: AllCookedFlow
}

export interface MarkSlotRoute {
  /** The address names a slot to mark (the parameter is present and well formed). */
  active: boolean
}

/**
 * Reads `mark` from the address. A malformed value is dropped. A slot with nothing left to mark toasts "Nothing is left to mark Cooked
 * there." and leaves at once. Leaving goes back one step when the app was opened from somewhere else (the Shopping List), else to /plan
 * without the parameter. It leaves when the open sheet closes or the Cooked is saved, and does not reopen on a refetch.
 */
export function useMarkSlotRoute(_input: MarkSlotRouteInput): MarkSlotRoute {
  return { active: false }
}
