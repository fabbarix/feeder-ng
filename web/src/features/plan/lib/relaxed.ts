// CRS F (ADR 0009): the line under the chips of the Planned Meal sheet that turns a relaxed pick into an action. STUB.
import type { PlannedMeal } from '../types'

const TODO = (): never => {
  throw new Error('CRS F: not implemented')
}

export type RelaxedAction =
  /** "Mark Recipes as <Course>": the Recipes list filtered to Recipes not marked with the Course (?notCourse=<id>). */
  | { kind: 'markRecipes'; label: string; courseId: number }
  /** "Add Recipes": the main Course, or a slot that serves one Course. */
  | { kind: 'addRecipes'; label: string }
  /** "Review Variety Rules": only a Variety Rule gave way. */
  | { kind: 'reviewVarietyRules'; label: string }

export interface RelaxedLine {
  text: string
  action: RelaxedAction
}

export interface RelaxedContext {
  courseId: number
  courseName: string
  /** True for the main Course. */
  main: boolean
  /** The slot serves more than one Course. */
  severalCourses: boolean
}

/**
 * null when the meal is not `relaxed`. Cool-down (a `cooldown_relaxed` why chip, also when a Variety chip is there):
 *  - several Courses, not the main: "Few Side Recipes, so this comes round sooner. Add Side Recipes for more variety."
 *    with action Mark Recipes as Side (markRecipes, label "Mark Recipes as Side");
 *  - several Courses, the main Course: "Few Main Recipes, so this comes round sooner. Add Main Recipes for more variety."
 *    with Add Recipes;
 *  - a one-Course slot: "Few Recipes, so this comes round sooner. Add Recipes for more variety." with Add Recipes.
 * Only a Variety Rule (`variety_relaxed` without `cooldown_relaxed`): "Few Recipes without fish fit here, so this
 * breaks a Variety Rule." (the Tag of the chip, as stored) with Review Variety Rules.
 */
export function relaxedLine(_meal: PlannedMeal, _ctx: RelaxedContext): RelaxedLine | null {
  return TODO()
}
