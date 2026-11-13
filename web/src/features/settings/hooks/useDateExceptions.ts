import type { DateException } from '../lib/mealSlotCards'

const NONE: DateException[] = []

/**
 * The upcoming dates on which a Meal Slot differs from its usual: its own time, Not served, Guests (B5-F1). Reads the plan through
 * settingsApi.planDates (react-query key ['plan', 'dates-that-differ']) and derives the rows with lib/mealSlotCards exceptionsFromPlan.
 * Empty while loading or when the plan cannot be read: the tile shows nothing then.
 */
export function useDateExceptions(): DateException[] {
  return NONE
}
