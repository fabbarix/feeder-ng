import { usePlan } from '../../plan'
import type { PlannedMeal, SlotKey } from '../../plan/types'

export interface UsePlannedMeal {
  /** True until the Plan has loaded. */
  isLoading: boolean
  /** The Planned Meal in that slot (any state), else null. */
  meal: PlannedMeal | null
}

/** The Planned Meal in one slot of the Plan; composes usePlan(). */
export function usePlannedMeal(key: SlotKey): UsePlannedMeal {
  const plan = usePlan()
  const meal = plan.slots.find((x) => x.date === key.date && x.mealSlotId === key.mealSlotId)?.meal ?? null
  return { isLoading: plan.isLoading || !plan.view, meal }
}
