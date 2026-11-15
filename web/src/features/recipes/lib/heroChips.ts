// B9-27 (RX-04, RX-13): the lead chips of Recipe detail's hero line, before the Tags. Plain TypeScript.
import { courseStrings, recipeStrings } from '../strings'
import { showsWholeMeal } from './recipeCourses'

/**
 * "Archived", the Courses (household order), "Whole meal" (only when showsWholeMeal), then "Ready Meal". These never collapse into "+N";
 * the Ready Meal chip moved here from the metric strip (RX-13).
 */
export function heroLeadChips(
  r: { archived: boolean; readyMeal: boolean; wholeMeal: boolean; courses: readonly { id: number; name: string }[] },
  courses: readonly { id: number; main: boolean; archived?: boolean }[],
): string[] {
  const out: string[] = []
  if (r.archived) out.push(recipeStrings.archived)
  for (const c of r.courses) out.push(c.name)
  if (r.wholeMeal && showsWholeMeal(r.courses.map((c) => c.id), courses)) out.push(courseStrings.wholeMealChip)
  if (r.readyMeal) out.push(recipeStrings.readyMeal)
  return out
}
