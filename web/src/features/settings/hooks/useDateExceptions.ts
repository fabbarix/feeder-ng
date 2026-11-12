import type { DateException } from '../lib/mealSlotCards'

const NONE: DateException[] = []

/**
 * The upcoming dates on which a Meal Slot differs from its usual. Main has no list of them (Date Attendance is read one slot and
 * date at a time), so this is empty until beta.5's per-date backend (SD/F1) adds a list; they replace this body and nothing else.
 */
export function useDateExceptions(): DateException[] {
  return NONE
}
