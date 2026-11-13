// BR-H (docs/design/base-recipes.md section 9): what Cook Mode says about the Steps a Base recipe brings. Plain TypeScript,
// no React. The server schedules; these functions only label and group what it sent.
import { cookStrings as s } from '../strings'
import type { BaseRecipeLabel } from '../types'

/** What readyBefore reads of an item: its Course (absent for a single Recipe's Steps) and its Base recipe. */
export interface BaseMarked {
  courseId?: number
  baseRecipe?: BaseRecipeLabel | null
}

/** The text of a Base recipe's chip: its path from the outermost name, joined with " · "; the name when the path is empty. */
export function baseChipText(label: BaseRecipeLabel): string {
  return label.path?.length ? label.path.join(' · ') : label.name
}

/** The outermost name of a Base recipe (its path's first name), which is what readiness and blocks are keyed by. */
function outermostName(label: BaseRecipeLabel): string {
  return label.path?.[0] ?? label.name
}

/**
 * For each item (same length, same order): the Base recipes that are ready by it, as names. A block is a maximal run of
 * one Course's items with the same outermost Base recipe; other Courses' items in between do not end it. The block is
 * ready by the next item of the same Course whose baseRecipe is null (the Recipe's own Step). Names are outermost and
 * de-duplicated, in the order their blocks ended.
 */
export function readyBefore(items: readonly BaseMarked[]): string[][] {
  const out: string[][] = items.map(() => [])
  const open = new Map<number | undefined, string>()
  const waiting = new Map<number | undefined, string[]>()
  const close = (course: number | undefined) => {
    const name = open.get(course)
    if (name === undefined) return
    open.delete(course)
    waiting.set(course, [...(waiting.get(course) ?? []), name])
  }
  items.forEach((item, i) => {
    const course = item.courseId
    const label = item.baseRecipe
    if (label) {
      const name = outermostName(label)
      if (open.get(course) !== name) close(course)
      if (!open.has(course)) open.set(course, name)
      return
    }
    close(course)
    const names = waiting.get(course)
    if (names && names.length > 0) {
      out[i] = [...new Set(names)]
      waiting.delete(course)
    }
  })
  return out
}

/** One line per covered Base recipe, in order: "Béchamel from Stock". Empty when none (or the payload has none). */
export function coveredLines(covered: readonly BaseRecipeLabel[] | undefined): string[] {
  return (covered ?? []).map((label) => s.coveredFromStock(baseChipText(label)))
}
