// CRS E2: view-model of the Course rows of an Import Review (docs/dev/design/crs-e2.md 4.1). Plain TypeScript. Stubs.
import type { CourseMatch, Problem, RecipeStatus } from '../types'

/** The rows that ask something: `unknown` and `archived`, in plan order. `exact` rows are matched and need no tile. */
export function questionRows(_rows: readonly CourseMatch[]): CourseMatch[] {
  throw new Error('not implemented')
}

/** The Recipe names behind `usedBy` paths (`$.recipes[2].courses[0]`), each Recipe once, in first-seen order; a path that names no listed Recipe is left out. */
export function usedByRecipes(_usedBy: readonly string[], _recipes: readonly RecipeStatus[]): string[] {
  throw new Error('not implemented')
}

/** Splits the Problems: the `too_many_courses` one (shown beside the Course rows) and all the others (the generic list). */
export function splitProblems(_problems: readonly Problem[]): { courseLimit: Problem | undefined; others: Problem[] } {
  throw new Error('not implemented')
}
