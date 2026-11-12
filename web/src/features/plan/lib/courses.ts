// CRS F: the Courses of a slot on a date (spec 7.5). Plain TypeScript, no React. STUBS: the Developer implements them.
// Design: docs/dev/design/crs-f.md section 2.
import type { AttendanceMember, PlanCourse, PlannedMeal, PlanSlot, SlotKey } from '../types'
import type { PlanChip } from './chips'

const TODO = (): never => {
  throw new Error('CRS F: not implemented')
}

/** One visible row of a slot block. */
export interface CourseRowModel {
  course: PlanCourse
  /** The key of this Course's Planned Meal: `{ date, mealSlotId }` plus `courseId` only when the slot has `courses`. */
  key: SlotKey
  /** The small Course caption: null while the slot shows one row; else the name, then " · without Sam" when it applies. */
  caption: string | null
}

/**
 * The slot's Courses. Without `slot.courses` (older fixtures, the course-less aliases) the slot is ONE main Course
 * built from `meal` and `unfilled`: `{ courseId: meal.courseId ?? 0, name: meal.courseName ?? 'Main', main: true,
 * optional: false, optOutMemberIds: [], meal, unfilled, coveredBy: null, unserved: null }`.
 */
export function slotCourses(_slot: PlanSlot): PlanCourse[] {
  return TODO()
}

/** `{ date, mealSlotId }`, plus `courseId` of the Course only when the slot carries `courses`. */
export function courseKey(_slot: PlanSlot, _course: PlanCourse): SlotKey {
  return TODO()
}

/**
 * The rows a slot shows, in the slot's order (history rows last). A Course shows a row when it holds a Planned Meal,
 * holds an `unfilled` reason, or has none of coveredBy and unserved (not yet planned). A covered Course and a
 * not-served Course (optional left empty, or nobody eats it) show NO row. The caption is set on every row only when
 * two or more rows are shown (a lone row looks exactly as before), as the Course name, plus " · " and
 * `withoutCaption(...)` when that is not null.
 */
export function courseRows(_slot: PlanSlot): CourseRowModel[] {
  return TODO()
}

/**
 * Who does not eat a Course, for the caption after the Course name: "without Sam", "without Sam and Ada" (two names),
 * "without 3" (more than two). Names come from the slot's attendance by id; an id with no known name counts toward the
 * number and forces the "without N" form. null when nobody opts out.
 */
export function withoutCaption(_optOutMemberIds: number[], _attendance: AttendanceMember[] | undefined): string | null {
  return TODO()
}

/**
 * The Courses the slot menu offers as "Add <Course>": served by the slot, with no Planned Meal and no reason
 * (`meal` and `unfilled` null) because they are covered, optional-and-empty or nobody eats them.
 */
export function addableCourses(_slot: PlanSlot): PlanCourse[] {
  return TODO()
}

/** The Planned Meals of the slot that are still to cook (state planned), in the slot's order. */
export function plannedMeals(_slot: PlanSlot): PlannedMeal[] {
  return TODO()
}

export interface SlotMenuModel {
  /** "Mark all Cooked": two or more Planned Meals to cook and the date is today or past (lib/resolve mayResolve). */
  markAllCooked: boolean
  /** "Not cooked: whole slot": same condition. */
  notCookedSlot: boolean
  /** "Add <Course>" per addable Course, key = courseKey. */
  add: { key: SlotKey; label: string }[]
}

/** The slot menu, or null when it would be empty (a one-Course slot never has one). */
export function slotMenu(_slot: PlanSlot, _today: string): SlotMenuModel | null {
  return TODO()
}

/** The row that takes the hero picture on Today: the main Course's row when its Planned Meal is still to cook (state planned), else the first row whose Planned Meal is; null when none. */
export function heroRow(_slot: PlanSlot): CourseRowModel | null {
  return TODO()
}

/** The rows under the hero row, in the slot's order. */
export function compactRows(_slot: PlanSlot): CourseRowModel[] {
  return TODO()
}

/**
 * The "Whole meal" status chip of a row: shown for a Whole meal Planned Meal in the main Course (`meal.wholeMeal`)
 * on a slot that serves several Courses (`slot.courses` holds more than one Course). null otherwise, so a one-Course
 * slot is unchanged. `{ key: 'status:whole-meal', kind: 'status', status: 'info', label: 'Whole meal' }`.
 */
export function wholeMealChip(_slot: PlanSlot, _row: CourseRowModel): PlanChip | null {
  return TODO()
}

/** The ids of the Courses with a Planned Meal still to cook (state planned), in the slot's order: Mark all Cooked asks about these. */
export function unresolvedCourseIds(_slot: PlanSlot): number[] {
  return TODO()
}
