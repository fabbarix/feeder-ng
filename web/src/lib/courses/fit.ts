// Course fit: a Recipe fills a Course only when it is marked with it (spec 3.1, 7.2). Pure helpers for pickers and editors.

/** True when the Recipe is marked with the Course. */
export function fitsCourse(_recipe: { courseIds: readonly number[] }, _courseId: number): boolean {
  throw new Error('not implemented')
}

/** The Recipes marked with the Course, in their input order. */
export function recipesForCourse<R extends { courseIds: readonly number[] }>(_recipes: readonly R[], _courseId: number): R[] {
  throw new Error('not implemented')
}

/** True when the ids include the active main Course: the Whole meal switch is shown only then (spec 4). */
export function includesMainCourse(_courseIds: readonly number[], _courses: readonly { id: number; main: boolean; archived?: boolean }[]): boolean {
  throw new Error('not implemented')
}

/** The ids in `before` that `after` no longer has, in their order in `before`: what a save takes off (spec 3.1 and 4). */
export function removedCourseIds(_before: readonly number[], _after: readonly number[]): number[] {
  throw new Error('not implemented')
}
