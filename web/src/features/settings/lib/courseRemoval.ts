// Delete / Archive of a Course: what the dialog says and sends. Plain TypeScript, no React. STUB (CRS D2 design step).
import type { CourseChoice, CourseImpact, ImpactMeal, ImpactRule } from '../../../lib/courses'

export type RemovalMode = 'delete' | 'archive'

const nope = (): never => {
  throw new Error('not implemented')
}

/** True when some Recipe or Meal Slot has only this Course, so a replacement Course is asked for and sent. */
export function needsReplacement(_impact: Pick<CourseImpact, 'recipesOnlyThis' | 'mealSlotsOnlyThis'>): boolean {
  return nope()
}

/** The Courses a replacement can be: the active ones except the Course itself, household order. */
export function replacementChoices(_courses: readonly CourseChoice[], _course: { id: number }): CourseChoice[] {
  return nope()
}

/** The select's starting value: the main Course among the choices, else the first choice, else null. */
export function defaultReplacement(_choices: readonly CourseChoice[]): number | null {
  return nope()
}

/** "Side is on 12 Recipes and 5 Meal Slots." / "Side is on 12 Recipes." / "Side is on 5 Meal Slots." / "Side is not on any Recipe or Meal Slot." */
export function usageLine(_name: string, _impact: Pick<CourseImpact, 'recipes' | 'mealSlots'>): string {
  return nope()
}

/** "3 Recipes and 2 Meal Slots have only Side: give them Main" (no full stop); "1 Recipe has only Side: give it Main"; null when nothing has only this Course. */
export function replacementLine(_name: string, _impact: Pick<CourseImpact, 'recipesOnlyThis' | 'mealSlotsOnlyThis'>, _replacementName: string): string | null {
  return nope()
}

/** "Thu 12 Nov" for an ISO date (YYYY-MM-DD): the short weekday, the day and the short month, in `locale`. */
export function shortDate(_iso: string, _locale?: string): string {
  return nope()
}

/** "Chicken stew · Dinner · Thu 12 Nov": a removed Planned Meal. */
export function plannedMealText(_meal: Pick<ImpactMeal, 'recipeName' | 'mealSlotName' | 'date'>, _locale?: string): string {
  return nope()
}

export interface MealLine {
  key: string
  text: string
  pinned: boolean
}

/** The Planned Meals that go, Pinned ones first (each group keeps the order given). */
export function plannedMealLines(_meals: readonly ImpactMeal[], _locale?: string): MealLine[] {
  return nope()
}

/** The Recipe's name for a rule by Recipe, "Tag vegetarian" for one by Tag; keyed by the rule id. */
export function slotRuleLines(_rules: readonly ImpactRule[]): { key: string; text: string }[] {
  return nope()
}

/** True for `409 course_planned`: the dialog switches from Delete to Archive. */
export function isPlannedRefusal(_err: unknown): boolean {
  return nope()
}

/** The sentence for a refused Delete or Archive (`course_main`, `course_last`, `validation_failed` on `replacement`); else the generic one. */
export function removalErrorMessage(_err: unknown): string {
  return nope()
}
