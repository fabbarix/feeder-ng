// DS-SHOP (docs/design/system.md §3, §9): "Includes Thu Dinner, not marked Cooked yet" is said ONCE for the whole list, above it.
// Plain TypeScript, no React.
import { shopStrings } from '../strings'
import type { PastPlannedMeal, ShoppingList } from '../types'
import { markItTarget } from './lines'
import { slotsLabel } from './rows'

export interface UnconfirmedNotice {
  /** "Includes Tue Dinner and Wed Lunch, not marked Cooked yet" */
  text: string
  /** how many open Lines include unconfirmed past meals */
  count: number
  /** "Mark it" opens the oldest of those slots on the Plan */
  markIt: { date: string; mealSlotId: number }
}

/**
 * The notice for the open Lines (ticked and Not needed Lines do not count): each slot once, oldest first, with the Courses
 * of one slot merged across Lines. null when no open Line includes an unconfirmed past meal.
 */
export function unconfirmedNotice(list: ShoppingList): UnconfirmedNotice | null {
  const open = list.lines.filter((line) => !line.ticked && (line.pastPlannedMeals?.length ?? 0) > 0)
  if (open.length === 0) return null
  const seen = new Set<string>()
  const meals: PastPlannedMeal[] = []
  for (const line of open) {
    for (const meal of line.pastPlannedMeals ?? []) {
      const key = `${meal.date}|${meal.mealSlotId}|${meal.courseName}`
      if (seen.has(key)) continue
      seen.add(key)
      meals.push(meal)
    }
  }
  meals.sort((a, b) => a.date.localeCompare(b.date) || a.mealSlotId - b.mealSlotId)
  const markIt = markItTarget(meals)
  if (!markIt) return null
  return { text: shopStrings.unconfirmedMeals(slotsLabel(meals)), count: open.length, markIt }
}
