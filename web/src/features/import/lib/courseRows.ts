// CRS E2: view-model of the Course rows of an Import Review (docs/dev/design/crs-e2.md 4.1). Plain TypeScript.
import type { CourseMatch, Problem, RecipeStatus } from '../types'

/** The rows that ask something: `unknown` and `archived`, in plan order. `exact` rows are matched and need no tile. */
export function questionRows(rows: readonly CourseMatch[]): CourseMatch[] {
  return rows.filter((r) => r.status !== 'exact')
}

/** The Recipe names behind `usedBy` paths (`$.recipes[2].courses[0]`), each Recipe once, in first-seen order; a path that names no listed Recipe is left out. */
export function usedByRecipes(usedBy: readonly string[], recipes: readonly RecipeStatus[]): string[] {
  const names: string[] = []
  for (const path of usedBy) {
    const m = /^\$\.recipes\[(\d+)\]/.exec(path)
    if (!m) continue
    const index = Number(m[1])
    const recipe = recipes.find((r) => r.index === index)
    if (recipe && !names.includes(recipe.name)) names.push(recipe.name)
  }
  return names
}

/** Splits the Problems: the `too_many_courses` one (shown beside the Course rows) and all the others (the generic list). */
export function splitProblems(problems: readonly Problem[]): { courseLimit: Problem | undefined; others: Problem[] } {
  return {
    courseLimit: problems.find((p) => p.code === 'too_many_courses'),
    others: problems.filter((p) => p.code !== 'too_many_courses'),
  }
}
