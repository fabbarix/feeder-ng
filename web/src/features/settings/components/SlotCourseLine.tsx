// The Courses line under a Meal Slot's name on the overview ("Main · Side · Dessert (optional) without Sam"); nothing when empty.
import { overviewCourseLine } from '../lib/slotCourses'
import type { MealSlot, Member } from '../types'

export function SlotCourseLine({ slot, members }: { slot: MealSlot; members: readonly Member[] }) {
  const line = overviewCourseLine(slot.courses ?? [], members, slot.attendance)
  return line ? <p className="meal-slot__courses">{line}</p> : null
}
