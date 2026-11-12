// CRS F (ADR 0009): the line under the chips of the Planned Meal sheet that turns a relaxed pick into an action. Plain TypeScript.
import { planStrings as s } from '../strings'
import type { PlannedMeal, Why } from '../types'

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
 *  - several Courses, not the main: "Few Side Recipes, ..." with action Mark Recipes as Side;
 *  - several Courses, the main Course: "Few Main Recipes, ..." with Add Recipes;
 *  - a one-Course slot: "Few Recipes, ..." with Add Recipes.
 * Only a Variety Rule (`variety_relaxed` without `cooldown_relaxed`): "Few Recipes without fish fit here, so this
 * breaks a Variety Rule." with Review Variety Rules.
 */
export function relaxedLine(meal: PlannedMeal, ctx: RelaxedContext): RelaxedLine | null {
  if (!meal.relaxed) return null
  const cool = meal.why.find((w: Why) => w.code === 'cooldown_relaxed')
  if (cool) {
    if (!ctx.severalCourses) {
      return { text: s.relaxedCoolOne, action: { kind: 'addRecipes', label: s.addRecipes } }
    }
    if (ctx.main) {
      return { text: s.relaxedCoolCourse(ctx.courseName), action: { kind: 'addRecipes', label: s.addRecipes } }
    }
    return {
      text: s.relaxedCoolCourse(ctx.courseName),
      action: { kind: 'markRecipes', label: s.markRecipesAs(ctx.courseName), courseId: ctx.courseId },
    }
  }
  const variety = meal.why.find((w: Why) => w.code === 'variety_relaxed')
  if (variety) {
    return { text: s.relaxedVariety(variety.tag ?? ''), action: { kind: 'reviewVarietyRules', label: s.reviewVarietyRules } }
  }
  return null
}
