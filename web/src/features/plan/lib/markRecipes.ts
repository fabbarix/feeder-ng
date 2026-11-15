// B9-32 (PC-07, FLOW-18): "Mark Recipes as Dessert" on the Plan. Plain TypeScript, no React: the rows of the sheet and the
// words of its toasts.
import { formatMinutes } from '../../../lib/time/formatMinutes'
import { planStrings as s } from '../strings'
import type { PlanChange } from './replan'

/** A Recipe as GET /api/recipes?notCourse= lists it: Course names when the server sends them, else the ids. */
export interface MarkableRecipe {
  id: number
  name: string
  totalMinutes: number
  courses?: { id: number; name: string }[]
  courseIds?: number[]
}

export interface MarkRow {
  id: number
  name: string
  /** "Main · 30 min", "No Course yet · 50 min", "Side, Main · 45 min". */
  meta: string
  checked: boolean
}

/** The Course names of a Recipe, in the order the server gave them; `names` maps a Course id to its name. */
function courseNamesOf(r: MarkableRecipe, names: ReadonlyMap<number, string>): string[] {
  if (r.courses) return r.courses.map((c) => c.name)
  return (r.courseIds ?? []).map((id) => names.get(id)).filter((n): n is string => Boolean(n))
}

/** True when a Recipe's Course names have to be looked up (the list sent only ids). */
export function needsCourseNames(recipes: readonly MarkableRecipe[]): boolean {
  return recipes.some((r) => !r.courses && (r.courseIds?.length ?? 0) > 0)
}

/** The sheet's rows: the Recipes whose name holds `search` (case-insensitive), with their meta and tick. */
export function markRows(recipes: readonly MarkableRecipe[], names: ReadonlyMap<number, string>, search: string, ticked: ReadonlySet<number>): MarkRow[] {
  const q = search.trim().toLocaleLowerCase()
  return recipes
    .filter((r) => q === '' || r.name.toLocaleLowerCase().includes(q))
    .map((r) => {
      const courses = courseNamesOf(r, names)
      const what = courses.length > 0 ? courses.join(', ') : s.markSheet.noCourse
      return { id: r.id, name: r.name, meta: `${what} · ${formatMinutes(r.totalMinutes)}`, checked: ticked.has(r.id) }
    })
}

/** The ticked ids, in the list's order (the order the Recipes were shown). */
export function tickedIds(recipes: readonly MarkableRecipe[], ticked: ReadonlySet<number>): number[] {
  return recipes.filter((r) => ticked.has(r.id)).map((r) => r.id)
}

/** How many meals the mark planned: the changes that filled an empty cell. */
export function mealsPlanned(changes: readonly PlanChange[]): number {
  return changes.filter((c) => c.before === null && c.after !== null).length
}

/** The toast after Mark: "2 Recipes marked as Dessert", subline "3 meals planned" (or that none was). */
export function markedToast(marked: number, course: string, changes: readonly PlanChange[]): { headline: string; subline: string } {
  const n = mealsPlanned(changes)
  return { headline: s.markSheet.marked(marked, course), subline: n > 0 ? s.markSheet.planned(n) : s.markSheet.nonePlanned }
}
