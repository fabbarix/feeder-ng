// Ordering and choosing Courses: the household order, a Meal Slot's own order, the main Course.
import { COURSES_EMPTY_MESSAGE } from './types'

/** Active Courses in household order (by `position`, then id). Archived ones are left out. Does not change its input. */
export function activeCourses<T extends { id: number; position: number; archived: boolean }>(courses: readonly T[]): T[] {
  return courses.filter((c) => !c.archived).sort((a, b) => a.position - b.position || a.id - b.id)
}

/** The one active Course flagged main, or undefined. */
export function mainCourse<T extends { main: boolean; archived?: boolean }>(courses: readonly T[]): T | undefined {
  return courses.find((c) => c.main && !c.archived)
}

/** What a new Meal Slot or Recipe starts with: the main Course alone, or nothing when there is none. */
export function defaultCourseIds(courses: readonly { id: number; main: boolean; archived?: boolean }[]): number[] {
  const main = mainCourse(courses)
  return main ? [main.id] : []
}

/** `ids` sorted into the order of `household`; unknown ids and duplicates are dropped. The unordered picker answers this. */
export function inHouseholdOrder(ids: readonly number[], household: readonly { id: number }[]): number[] {
  const rank = new Map(household.map((c, i) => [c.id, i]))
  return [...new Set(ids)].filter((id) => rank.has(id)).sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0))
}

/** `ids` as they are (a Meal Slot's order is kept) without the ids `household` does not list, and without duplicates. */
export function dropUnknownCourses(ids: readonly number[], household: readonly { id: number }[]): number[] {
  const known = new Set(household.map((c) => c.id))
  return [...new Set(ids)].filter((id) => known.has(id))
}

/** Ordered form: takes `id` off when chosen, else adds it last. */
export function toggleOrdered(ids: readonly number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
}

/** Unordered form: toggles `id` and answers in household order. */
export function toggleUnordered(ids: readonly number[], id: number, household: readonly { id: number }[]): number[] {
  return inHouseholdOrder(toggleOrdered(ids, id), household)
}

/** Moves the item at `index` one place up (-1) or down (1). At an edge it answers the same array (compare with `===`). */
export function moveCourse(ids: readonly number[], index: number, delta: -1 | 1): readonly number[] {
  const target = index + delta
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) return ids
  const out = [...ids]
  const moved = out[index] as number
  out[index] = out[target] as number
  out[target] = moved
  return out
}

/** `null` when the choice is valid, else "Choose at least one Course". */
export function validateCourseIds(ids: readonly number[]): string | null {
  return ids.length === 0 ? COURSES_EMPTY_MESSAGE : null
}

/** "Main · Side": the names of a slot's Courses for overviews and rows. */
export function courseListLabel(names: readonly string[]): string {
  return names.join(' · ')
}
