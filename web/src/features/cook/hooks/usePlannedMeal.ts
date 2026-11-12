import { usePlan } from '../../plan'
import { courseOf } from '../../plan/lib/courses'
import type { PlannedMeal, SlotKey } from '../../plan/types'

export interface UsePlannedMeal {
  /** True until the Plan has loaded. */
  isLoading: boolean
  /** The Planned Meal of that Course in that slot (any state), else null. Without a courseId, the main Course's. */
  meal: PlannedMeal | null
}

/** The Planned Meal of one Course (the main Course when the key has no courseId) in one slot of the Plan; composes usePlan(). */
export function usePlannedMeal(key: SlotKey): UsePlannedMeal {
  const plan = usePlan()
  const slot = plan.slots.find((x) => x.date === key.date && x.mealSlotId === key.mealSlotId)
  const meal = (slot ? courseOf(slot, key.courseId)?.meal : null) ?? null
  return { isLoading: plan.isLoading || !plan.view, meal }
}
