// CRS E2: the pure rules of a Recipe's Courses and Whole meal for the editor (docs/dev/design/crs-e2.md 2). Plain TypeScript, no React.
// Stubs: the developer fills them in.
import type { CourseChoice } from '../../../lib/courses'
import type { CourseLoss, RecipeSlotRule, SlotName } from '../types'
import type { RecipeDraft } from './draft'

type CourseFlag = { id: number; main: boolean; archived?: boolean }

/** True when the ids include the active main Course: the Whole meal switch is shown only then (spec 4). */
export function showsWholeMeal(_courseIds: readonly number[], _courses: readonly CourseFlag[]): boolean {
  throw new Error('not implemented')
}

/** The default Whole meal of a Recipe: true for a Ready Meal whose Courses include the main Course, false otherwise (ADR 0008, point 3). */
export function defaultWholeMeal(_readyMeal: boolean, _courseIds: readonly number[], _courses: readonly CourseFlag[]): boolean {
  throw new Error('not implemented')
}

/**
 * The step after a change of the draft (`prev` to `next`), run by the editor hook on every setDraft:
 * - a changed Whole meal that the step itself did not make is the User's: `wholeMealSet` becomes true;
 * - Ready Meal going from off to on, with the Courses including the main Course and `wholeMealSet` false, makes Whole meal true;
 * - Ready Meal going off, or Courses changing, never touches Whole meal (the stored value survives a hidden switch).
 */
export function reconcileWholeMeal(_prev: RecipeDraft, _next: RecipeDraft, _courses: readonly CourseFlag[]): RecipeDraft {
  throw new Error('not implemented')
}

/** A new Recipe starts with the main Course: an empty choice becomes `[main.id]`. Anything else (a choice, no main Course known) is returned as it is. */
export function withDefaultCourse(_draft: RecipeDraft, _courses: readonly CourseChoice[]): RecipeDraft {
  throw new Error('not implemented')
}

/** `{ courses: 'courses_empty' }` for an empty choice, `{}` otherwise. */
export function validateCourses(_draft: RecipeDraft): Record<string, string> {
  throw new Error('not implemented')
}

/** The names of the ids in household order (`courses` is in that order); ids `courses` does not list are left out. */
export function courseNamesOf(_ids: readonly number[], _courses: readonly CourseChoice[]): string[] {
  throw new Error('not implemented')
}

/** "Side", "Side and Dessert", "Side, Starter and Dessert"; '' for none. */
export function joinNames(_names: readonly string[]): string {
  throw new Error('not implemented')
}

/**
 * What saving takes away: the Slot Rules BY this Recipe (a rule with a `recipeId`, never one by Tag) on a Course the draft takes off.
 * `courseNames` are the taken-off Courses that lose a rule, household order; each rule is labelled "<Meal Slot> · <Course> = <Recipe>"
 * ("Friday Dinner · Side = rice") in the order the API gave them. Null when nothing is lost, for a new Recipe (`recipeId` undefined) too.
 */
export function lostSlotRules(_input: {
  recipeId: number | undefined
  storedIds: readonly number[]
  draftIds: readonly number[]
  rules: readonly RecipeSlotRule[]
  slots: readonly SlotName[]
  courses: readonly CourseChoice[]
}): CourseLoss | null {
  throw new Error('not implemented')
}
