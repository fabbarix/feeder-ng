import { usePlan } from '../../plan'
import { courseOf } from '../../plan/lib/courses'
import type { PlannedMeal, SlotKey } from '../../plan/types'
import { reheatLines } from '../lib/reheat'

export interface UsePlannedMeal {
  /** True until the Plan has loaded. */
  isLoading: boolean
  /** The Planned Meal of that Course in that slot (any state), else null. Without a courseId, the main Course's. */
  meal: PlannedMeal | null
  /** B9-40 (PC-15): the Reheat tile's overline and meta (lib/reheat reheatLines); null without a meal. */
  reheatLines: { overline: string; meta: string } | null
}

/** The Planned Meal of one Course (the main Course when the key has no courseId) in one slot of the Plan; composes usePlan(). */
export function usePlannedMeal(key: SlotKey): UsePlannedMeal {
  const plan = usePlan()
  const slot = plan.slots.find((x) => x.date === key.date && x.mealSlotId === key.mealSlotId)
  const meal = (slot ? courseOf(slot, key.courseId)?.meal : null) ?? null
  const lines = meal ? reheatLines(meal.portions, meal.servedFromLeftover, slot ?? null, plan.slots) : null
  return { isLoading: plan.isLoading || !plan.view, meal, reheatLines: lines }
}
