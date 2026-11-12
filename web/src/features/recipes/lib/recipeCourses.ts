// CRS E2: the pure rules of a Recipe's Courses and Whole meal for the editor (docs/dev/design/crs-e2.md 2). Plain TypeScript, no React.
import type { CourseChoice } from '../../../lib/courses'
import type { CourseLoss, LostRule, RecipeSlotRule, SlotName } from '../types'
import type { RecipeDraft } from './draft'

type CourseFlag = { id: number; main: boolean; archived?: boolean }

/** True when the ids include the active main Course: the Whole meal switch is shown only then (spec 4). */
export function showsWholeMeal(courseIds: readonly number[], courses: readonly CourseFlag[]): boolean {
  return courses.some((c) => c.main && !c.archived && courseIds.includes(c.id))
}

/** The default Whole meal of a Recipe: true for a Ready Meal whose Courses include the main Course, false otherwise (ADR 0008, point 3). */
export function defaultWholeMeal(readyMeal: boolean, courseIds: readonly number[], courses: readonly CourseFlag[]): boolean {
  return readyMeal && showsWholeMeal(courseIds, courses)
}

/**
 * The step after a change of the draft (`prev` to `next`), run by the editor hook on every setDraft:
 * - a changed Whole meal that the step itself did not make is the User's: `wholeMealSet` becomes true;
 * - Ready Meal going from off to on, with the Courses including the main Course and `wholeMealSet` false, makes Whole meal true;
 * - Ready Meal going off, or Courses changing, never touches Whole meal (the stored value survives a hidden switch).
 */
export function reconcileWholeMeal(prev: RecipeDraft, next: RecipeDraft, courses: readonly CourseFlag[]): RecipeDraft {
  if (next.wholeMeal !== prev.wholeMeal) return { ...next, wholeMealSet: true }
  if (!prev.readyMeal && next.readyMeal && !next.wholeMealSet && defaultWholeMeal(true, next.courseIds, courses)) {
    return { ...next, wholeMeal: true }
  }
  return next
}

/** A new Recipe starts with the main Course: an empty choice becomes `[main.id]`. Anything else (a choice, no main Course known) is returned as it is. */
export function withDefaultCourse(draft: RecipeDraft, courses: readonly CourseChoice[]): RecipeDraft {
  if (draft.courseIds.length > 0) return draft
  const main = courses.find((c) => c.main)
  return main ? { ...draft, courseIds: [main.id] } : draft
}

/** `{ courses: 'courses_empty' }` for an empty choice, `{}` otherwise. */
export function validateCourses(draft: RecipeDraft): Record<string, string> {
  return draft.courseIds.length === 0 ? { courses: 'courses_empty' } : {}
}

/** The names of the ids in household order (`courses` is in that order); ids `courses` does not list are left out. */
export function courseNamesOf(ids: readonly number[], courses: readonly CourseChoice[]): string[] {
  return courses.filter((c) => ids.includes(c.id)).map((c) => c.name)
}

/** "Side", "Side and Dessert", "Side, Starter and Dessert"; '' for none. */
export function joinNames(names: readonly string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]!
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * What saving takes away: the Slot Rules BY this Recipe (a rule with a `recipeId`, never one by Tag) on a Course the draft takes off.
 * `courseNames` are the taken-off Courses that lose a rule, household order; each rule is labelled "<Meal Slot> · <Course> = <Recipe>"
 * ("Friday Dinner · Side = rice") in the order the API gave them. Null when nothing is lost, for a new Recipe (`recipeId` undefined) too.
 */
export function lostSlotRules(input: {
  recipeId: number | undefined
  storedIds: readonly number[]
  draftIds: readonly number[]
  rules: readonly RecipeSlotRule[]
  slots: readonly SlotName[]
  courses: readonly CourseChoice[]
}): CourseLoss | null {
  const { recipeId, storedIds, draftIds, rules, slots, courses } = input
  if (recipeId === undefined) return null
  const taken = storedIds.filter((id) => !draftIds.includes(id))
  if (taken.length === 0) return null
  const listed = (courseId: number) => courses.find((c) => c.id === courseId)
  const lost = rules.filter((r) => r.recipeId === recipeId && taken.includes(r.courseId) && listed(r.courseId) !== undefined)
  if (lost.length === 0) return null
  const courseNames = courses.filter((c) => taken.includes(c.id) && lost.some((r) => r.courseId === c.id)).map((c) => c.name)
  const labelled: LostRule[] = lost.map((r) => {
    const slot = slots.find((s) => s.id === r.mealSlotId)?.name ?? ''
    const course = listed(r.courseId)?.name ?? ''
    return { id: r.id, label: `${slot} · ${course} = ${r.recipeName ?? ''}` }
  })
  return { courseNames, rules: labelled }
}

/**
 * Applies a change the Courses picker made (`picked`, made against the `shown` ids) to the latest `current` ids: the one Course the
 * picker added or removed is toggled in `current`, and an added one takes its household place. Used so a quick second tap works on
 * the draft as it is now.
 */
export function pickCourseIds(current: readonly number[], shown: readonly number[], picked: readonly number[], courses: readonly CourseChoice[]): number[] {
  const id = picked.find((x) => !shown.includes(x)) ?? shown.find((x) => !picked.includes(x))
  if (id === undefined) return [...current]
  if (current.includes(id)) return current.filter((x) => x !== id)
  const next = [...current, id]
  return courses.filter((c) => next.includes(c.id)).map((c) => c.id)
}
