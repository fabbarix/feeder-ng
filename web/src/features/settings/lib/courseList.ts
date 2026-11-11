// Settings > Courses: the row copy, the actions menu and the reorder maths. Plain TypeScript, no React. STUB (CRS D2 design step).
import type { Course } from '../../../lib/courses'

export interface CourseAction {
  id: 'rename' | 'makeMain' | 'delete'
  label: string
  disabled?: boolean
  tone?: 'danger'
}

/** "12 Recipes · 5 Meal Slots" (singular for 1, zeros shown); an unknown count is left out; '' when both are unknown. */
export function courseMeta(_course: Pick<Course, 'recipeCount' | 'mealSlotCount'>): string {
  throw new Error('not implemented')
}

/** The actions menu of a Course row: Rename, Make main (not on the main Course), Delete (on the main Course it is the disabled "Make another Course main first"). */
export function courseActions(_course: Pick<Course, 'name' | 'main'>): CourseAction[] {
  throw new Error('not implemented')
}

/** The Course ids after the item at `from` is dropped at `to` (Sortable's onReorder); the same order for a no-op or an index out of range. Leaves `ids` alone. */
export function reorderedIds(_ids: readonly number[], _from: number, _to: number): number[] {
  throw new Error('not implemented')
}

/** True while the list (archived Courses not counted) is under MAX_COURSES. */
export function canAddCourse(_activeCount: number): boolean {
  throw new Error('not implemented')
}
