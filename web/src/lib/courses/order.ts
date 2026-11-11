// Ordering and choosing Courses: the household order, a Meal Slot's own order, the main Course.

/** Active Courses in household order (by `position`, then id). Archived ones are left out. Does not change its input. */
export function activeCourses<T extends { id: number; position: number; archived: boolean }>(_courses: readonly T[]): T[] {
  throw new Error('not implemented')
}

/** The one active Course flagged main, or undefined. */
export function mainCourse<T extends { main: boolean; archived?: boolean }>(_courses: readonly T[]): T | undefined {
  throw new Error('not implemented')
}

/** What a new Meal Slot or Recipe starts with: the main Course alone, or nothing when there is none. */
export function defaultCourseIds(_courses: readonly { id: number; main: boolean; archived?: boolean }[]): number[] {
  throw new Error('not implemented')
}

/** `ids` sorted into the order of `household`; unknown ids and duplicates are dropped. The unordered picker answers this. */
export function inHouseholdOrder(_ids: readonly number[], _household: readonly { id: number }[]): number[] {
  throw new Error('not implemented')
}

/** `ids` as they are (a Meal Slot's order is kept) without the ids `household` does not list, and without duplicates. */
export function dropUnknownCourses(_ids: readonly number[], _household: readonly { id: number }[]): number[] {
  throw new Error('not implemented')
}

/** Ordered form: takes `id` off when chosen, else adds it last. */
export function toggleOrdered(_ids: readonly number[], _id: number): number[] {
  throw new Error('not implemented')
}

/** Unordered form: toggles `id` and answers in household order. */
export function toggleUnordered(_ids: readonly number[], _id: number, _household: readonly { id: number }[]): number[] {
  throw new Error('not implemented')
}

/** Moves the item at `index` one place up (-1) or down (1). At an edge it answers the same array (compare with `===`). */
export function moveCourse(_ids: readonly number[], _index: number, _delta: -1 | 1): readonly number[] {
  throw new Error('not implemented')
}

/** `null` when the choice is valid, else "Choose at least one Course". */
export function validateCourseIds(_ids: readonly number[]): string | null {
  throw new Error('not implemented')
}

/** "Main · Side": the names of a slot's Courses for overviews and rows. */
export function courseListLabel(_names: readonly string[]): string {
  throw new Error('not implemented')
}
