// Course domain types and constants. Plain TypeScript, no React. The shapes follow functional-spec section 16.

/** A Course as `GET /api/courses` answers it, in household order. */
export interface Course {
  id: number
  name: string
  position: number
  main: boolean
  archived: boolean
  recipeCount?: number
  mealSlotCount?: number
  planned?: boolean
}

/** What a picker needs of a Course: an id, a name and the main flag. A list of choices is already in the order to show. */
export interface CourseChoice {
  id: number
  name: string
  main: boolean
}

/** A Course name is 1 to 40 characters (spec 3.1). */
export const COURSE_NAME_MAX = 40
/** At most 20 Courses in the list, archived ones not counted (spec 3.1). */
export const MAX_COURSES = 20
/** The message of an empty choice, for a Meal Slot or a Recipe (spec 3.1 and 4). */
export const COURSES_EMPTY_MESSAGE = 'Choose at least one Course'
