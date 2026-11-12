// Delete / Archive of a Course: what the dialog says and sends. Plain TypeScript, no React.
import { ApiError } from '../../../lib/http'
import type { CourseChoice, CourseImpact, ImpactMeal, ImpactRule } from '../../../lib/courses'
import { coursesStrings } from '../coursesStrings'

export type RemovalMode = 'delete' | 'archive'

const s = coursesStrings.removal

/** True when some Recipe or Meal Slot has only this Course, so a replacement Course is asked for and sent. */
export function needsReplacement(impact: Pick<CourseImpact, 'recipesOnlyThis' | 'mealSlotsOnlyThis'>): boolean {
  return impact.recipesOnlyThis + impact.mealSlotsOnlyThis > 0
}

/** The Courses a replacement can be: the active ones except the Course itself, household order. */
export function replacementChoices(courses: readonly CourseChoice[], course: { id: number }): CourseChoice[] {
  return courses.filter((c) => c.id !== course.id)
}

/** The select's starting value: the main Course among the choices, else the first choice, else null. */
export function defaultReplacement(choices: readonly CourseChoice[]): number | null {
  return (choices.find((c) => c.main) ?? choices[0])?.id ?? null
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "Side is on 12 Recipes and 5 Meal Slots." / "Side is on 12 Recipes." / "Side is on 5 Meal Slots." / "Side is not on any Recipe or Meal Slot." */
export function usageLine(name: string, impact: Pick<CourseImpact, 'recipes' | 'mealSlots'>): string {
  const parts: string[] = []
  if (impact.recipes > 0) parts.push(count(impact.recipes, 'Recipe', 'Recipes'))
  if (impact.mealSlots > 0) parts.push(count(impact.mealSlots, 'Meal Slot', 'Meal Slots'))
  if (parts.length === 0) return `${name} is not on any Recipe or Meal Slot.`
  return `${name} is on ${parts.join(' and ')}.`
}

/** "3 Recipes and 2 Meal Slots have only Side: give them Main" (no full stop); "1 Recipe has only Side: give it Main"; null when nothing has only this Course. */
export function replacementLine(name: string, impact: Pick<CourseImpact, 'recipesOnlyThis' | 'mealSlotsOnlyThis'>, replacementName: string): string | null {
  const { recipesOnlyThis: r, mealSlotsOnlyThis: m } = impact
  if (r + m === 0) return null
  const parts: string[] = []
  if (r > 0) parts.push(count(r, 'Recipe', 'Recipes'))
  if (m > 0) parts.push(count(m, 'Meal Slot', 'Meal Slots'))
  const it = r + m === 1 ? 'it' : 'them'
  const verb = r + m === 1 ? 'has' : 'have'
  return `${parts.join(' and ')} ${verb} only ${name}: give ${it} ${replacementName}`
}

const dateParts = (iso: string) => {
  const [y, mo, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y!, mo! - 1, d!))
}

/** "Thu 12 Nov" for an ISO date (YYYY-MM-DD): the short weekday, the day and the short month, in `locale`. */
export function shortDate(iso: string, locale = 'en'): string {
  const date = dateParts(iso)
  const opts = { timeZone: 'UTC' } as const
  const weekday = date.toLocaleDateString(locale, { ...opts, weekday: 'short' })
  const day = date.toLocaleDateString(locale, { ...opts, day: 'numeric' })
  const month = date.toLocaleDateString(locale, { ...opts, month: 'short' })
  return `${weekday} ${day} ${month}`
}

/** "Chicken stew · Dinner · Thu 12 Nov": a removed Planned Meal. */
export function plannedMealText(meal: Pick<ImpactMeal, 'recipeName' | 'mealSlotName' | 'date'>, locale = 'en'): string {
  return `${meal.recipeName} · ${meal.mealSlotName} · ${shortDate(meal.date, locale)}`
}

export interface MealLine {
  key: string
  text: string
  pinned: boolean
}

/** The Planned Meals that go, Pinned ones first (each group keeps the order given). */
export function plannedMealLines(meals: readonly ImpactMeal[], locale = 'en'): MealLine[] {
  const ordered = [...meals.filter((m) => m.pinned), ...meals.filter((m) => !m.pinned)]
  return ordered.map((m, i) => ({
    key: `${m.date}-${m.mealSlotId}-${m.recipeId ?? m.recipeName}-${i}`,
    text: plannedMealText(m, locale),
    pinned: m.pinned,
  }))
}

/** The Recipe's name for a rule by Recipe, "Tag vegetarian" for one by Tag; keyed by the rule id. */
export function slotRuleLines(rules: readonly ImpactRule[]): { key: string; text: string }[] {
  return rules.map((r) => ({
    key: `rule-${r.id}`,
    text: r.recipeName ?? `Tag ${r.tag ?? ''}`.trimEnd(),
  }))
}

/** True for `409 course_planned`: the dialog switches from Delete to Archive. */
export function isPlannedRefusal(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'course_planned'
}

/** The sentence for a refused Delete or Archive (`course_main`, `course_last`, `validation_failed` on `replacement`); else the generic one. */
export function removalErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'course_main') return s.courseMain
    if (err.code === 'course_last') return s.courseLast
    if (err.code === 'validation_failed' && err.details.field === 'replacement') return s.replacementInvalid
  }
  return coursesStrings.actionFailed
}
