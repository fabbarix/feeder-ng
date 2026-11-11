// Course fit: a Recipe fills a Course only when it is marked with it (spec 3.1, 7.2). Pure helpers for pickers and editors.

/** True when the Recipe is marked with the Course. */
export function fitsCourse(recipe: { courseIds: readonly number[] }, courseId: number): boolean {
  return recipe.courseIds.includes(courseId)
}

/** The Recipes marked with the Course, in their input order. */
export function recipesForCourse<R extends { courseIds: readonly number[] }>(recipes: readonly R[], courseId: number): R[] {
  return recipes.filter((r) => fitsCourse(r, courseId))
}

/** True when the ids include the active main Course: the Whole meal switch is shown only then (spec 4). */
export function includesMainCourse(courseIds: readonly number[], courses: readonly { id: number; main: boolean; archived?: boolean }[]): boolean {
  const main = courses.find((c) => c.main && !c.archived)
  return main !== undefined && courseIds.includes(main.id)
}

/** The ids in `before` that `after` no longer has, in their order in `before`: what a save takes off (spec 3.1 and 4). */
export function removedCourseIds(before: readonly number[], after: readonly number[]): number[] {
  return before.filter((id) => !after.includes(id))
}
