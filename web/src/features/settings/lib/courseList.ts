// Settings > Courses: the row copy, the actions menu and the reorder maths. Plain TypeScript, no React.
import { MAX_COURSES, type Course } from '../../../lib/courses'

export interface CourseAction {
  id: 'rename' | 'makeMain' | 'delete'
  label: string
  disabled?: boolean
  tone?: 'danger'
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "12 Recipes · 5 Meal Slots" (singular for 1, zeros shown); an unknown count is left out; '' when both are unknown. */
export function courseMeta(course: Pick<Course, 'recipeCount' | 'mealSlotCount'>): string {
  const parts: string[] = []
  if (course.recipeCount !== undefined) parts.push(plural(course.recipeCount, 'Recipe', 'Recipes'))
  if (course.mealSlotCount !== undefined) parts.push(plural(course.mealSlotCount, 'Meal Slot', 'Meal Slots'))
  return parts.join(' · ')
}

/** The actions menu of a Course row: Rename, Make main (not on the main Course), Delete (on the main Course it is the disabled "Make another Course main first"). */
export function courseActions(course: Pick<Course, 'name' | 'main'>): CourseAction[] {
  const rename: CourseAction = { id: 'rename', label: 'Rename' }
  const makeMain: CourseAction[] = course.main ? [] : [{ id: 'makeMain', label: 'Make main' }]
  const del: CourseAction = course.main
    ? { id: 'delete', label: 'Make another Course main first', disabled: true }
    : { id: 'delete', label: 'Delete', tone: 'danger' }
  return [rename, ...makeMain, del]
}

/** The Course ids after the item at `from` is dropped at `to` (Sortable's onReorder); the same order for a no-op or an index out of range. Leaves `ids` alone. */
export function reorderedIds(ids: readonly number[], from: number, to: number): number[] {
  const out = [...ids]
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= out.length || to < 0 || to >= out.length) return out
  const [moved] = out.splice(from, 1)
  out.splice(to, 0, moved!)
  return out
}

/** True while the list (archived Courses not counted) is under MAX_COURSES. */
export function canAddCourse(activeCount: number): boolean {
  return activeCount < MAX_COURSES
}
