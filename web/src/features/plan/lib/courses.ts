// CRS F: the Courses of a slot on a date (spec 7.5). Plain TypeScript, no React.
import { planStrings as s } from '../strings'
import type { AttendanceMember, PlanCourse, PlannedMeal, PlanSlot, SlotKey } from '../types'
import type { PlanChip } from './chips'
import { mayResolve } from './resolve'
import { dateChoices as dateChoicesOf, timeChoiceLabel } from './slotDate'

/** One visible row of a slot block. */
export interface CourseRowModel {
  course: PlanCourse
  /** The key of this Course's Planned Meal: `{ date, mealSlotId }` plus `courseId` only when the slot has `courses`. */
  key: SlotKey
  /** The small Course caption: null while the slot shows one row; else the name, then " · without Sam" when it applies. */
  caption: string | null
}

/** The slot's Courses in the slot's order (none when the slot carries none). A slot has no meal of its own (crs-c3). */
export function slotCourses(slot: PlanSlot): PlanCourse[] {
  return slot.courses ?? []
}

/** The Course a key names by its real id; no id, or an id the slot does not serve, names no Course. */
export function courseOf(slot: PlanSlot, courseId: number | undefined): PlanCourse | undefined {
  if (courseId === undefined) return undefined
  return slotCourses(slot).find((c) => c.courseId === courseId)
}

/** The Planned Meal key of one Course: `{ date, mealSlotId, courseId }` with the Course's real id. */
export function courseKey(slot: PlanSlot, course: PlanCourse): SlotKey {
  return { date: slot.date, mealSlotId: slot.mealSlotId, courseId: course.courseId }
}

/**
 * Who does not eat a Course, for the caption after the Course name: "without Sam", "without Sam and Ada" (two names),
 * "without 3" (more than two). Names come from the slot's attendance by id; an id with no known name counts toward the
 * number and forces the "without N" form. null when nobody opts out.
 */
export function withoutCaption(optOutMemberIds: number[], attendance: AttendanceMember[] | undefined): string | null {
  if (optOutMemberIds.length === 0) return null
  const names = optOutMemberIds.map((id) => attendance?.find((m) => m.id === id)?.name)
  if (optOutMemberIds.length > 2 || names.some((n) => n === undefined)) return s.courseWithoutCount(optOutMemberIds.length)
  if (names.length === 1) return s.courseWithoutOne(names[0]!)
  return s.courseWithoutTwo(names[0]!, names[1]!)
}

/** A Course shows a row when it holds a Planned Meal or a reason, or it is not yet planned (neither covered nor unserved). */
function showsRow(course: PlanCourse): boolean {
  if (course.meal !== null || course.unfilled !== null) return true
  return course.coveredBy === null && course.unserved === null
}

/**
 * The rows a slot shows, in the slot's order (history rows last). A covered Course and a not-served Course (optional
 * left empty, or nobody eats it) show NO row. The caption is set on every row only when two or more rows are shown
 * (a lone row looks exactly as before), as the Course name, plus " · " and `withoutCaption(...)` when that is not null.
 */
export function courseRows(slot: PlanSlot): CourseRowModel[] {
  const shown = slotCourses(slot).filter(showsRow)
  const several = shown.length >= 2
  return shown.map((course) => {
    const without = withoutCaption(course.optOutMemberIds, slot.attendance)
    const caption = several ? (without ? `${course.name} · ${without}` : course.name) : null
    return { course, key: courseKey(slot, course), caption }
  })
}

/**
 * The Courses the slot menu offers as "Add <Course>": served by the slot, with no Planned Meal and no reason
 * (`meal` and `unfilled` null) because they are covered, optional-and-empty or nobody eats them.
 */
export function addableCourses(slot: PlanSlot): PlanCourse[] {
  return slotCourses(slot).filter((c) => c.meal === null && c.unfilled === null)
}

/** The Planned Meals of the slot that are still to cook (state planned), in the slot's order. */
export function plannedMeals(slot: PlanSlot): PlannedMeal[] {
  return slotCourses(slot)
    .map((c) => c.meal)
    .filter((m): m is PlannedMeal => m !== null && m.state === 'planned')
}

export interface SlotMenuModel {
  /** "Mark all Cooked": two or more Planned Meals to cook and the date is today or past (lib/resolve mayResolve). */
  markAllCooked: boolean
  /** "Not cooked: whole slot": same condition. */
  notCookedSlot: boolean
  /** "Add <Course>" per addable Course, key = courseKey. */
  add: { key: SlotKey; label: string }[]
  /** B5-F1: the per-date choices (lib/slotDate dateChoices). Present only when `slotMenu` was asked for them (then all three keys are set). */
  whosEating?: boolean
  notServed?: boolean
  /** "Time today" / "Time on Thu", or null when the time cannot change. */
  time?: string | null
}

/**
 * The slot menu, or null when no entry applies. Without `dateChoices` it is as before (a one-Course slot never has one).
 * With `dateChoices` (the screen wired the per-date handlers) it also holds Who's eating, Time today and Not served per
 * lib/slotDate dateChoices, so a one-Course slot has a menu too (reconcile section 9, Q3).
 */
export function slotMenu(slot: PlanSlot, today: string, dateChoices = false): SlotMenuModel | null {
  if (!dateChoices && slotCourses(slot).length < 2) return null
  const wholeSlot = plannedMeals(slot).length >= 2 && mayResolve(slot.date, today)
  // A covered Course is not offered: a Whole meal already serves it.
  const add = addableCourses(slot)
    .filter((c) => c.coveredBy === null)
    .map((c) => ({ key: courseKey(slot, c), label: s.addCourse(c.name) }))
  const choices = dateChoices ? dateChoicesOf(slot, today) : null
  const anyDate = choices !== null && (choices.whosEating || choices.notServed || choices.time)
  if (!wholeSlot && add.length === 0 && !anyDate) return null
  const menu: SlotMenuModel = { markAllCooked: wholeSlot, notCookedSlot: wholeSlot, add }
  if (choices) {
    menu.whosEating = choices.whosEating
    menu.notServed = choices.notServed
    menu.time = choices.time ? timeChoiceLabel(slot, today) : null
  }
  return menu
}

/** The row that takes the hero picture on Today: the main Course's row when its Planned Meal is still to cook, else the first row whose Planned Meal is; null when none. */
export function heroRow(slot: PlanSlot): CourseRowModel | null {
  const open = courseRows(slot).filter((r) => r.course.meal?.state === 'planned')
  return open.find((r) => r.course.main) ?? open[0] ?? null
}

/** The rows under the hero row, in the slot's order. */
export function compactRows(slot: PlanSlot): CourseRowModel[] {
  const heroId = heroRow(slot)?.course.courseId
  return courseRows(slot).filter((r) => r.course.courseId !== heroId)
}

/**
 * The "Whole meal" status chip of a row: shown for a Whole meal Planned Meal in the main Course (`meal.wholeMeal`)
 * on a slot that serves several Courses (`slot.courses` holds more than one Course). null otherwise, so a one-Course
 * slot is unchanged.
 */
export function wholeMealChip(slot: PlanSlot, row: CourseRowModel): PlanChip | null {
  if (slotCourses(slot).length < 2) return null
  if (!row.course.main || row.course.meal?.wholeMeal !== true) return null
  return { key: 'status:whole-meal', kind: 'status', status: 'info', label: s.wholeMeal }
}

/** The ids of the Courses with a Planned Meal still to cook (state planned), in the slot's order: Mark all Cooked asks about these. */
export function unresolvedCourseIds(slot: PlanSlot): number[] {
  return slotCourses(slot)
    .filter((c) => c.meal?.state === 'planned')
    .map((c) => c.courseId)
}

/**
 * The rows a Meal Slot shows on a day tile (ds-plan): the Course rows of `courseRows`, or, when none is shown (the only
 * Course is covered or not served), the main Course as one empty row. Empty for a slot with no Courses.
 */
export function slotRows(slot: PlanSlot): CourseRowModel[] {
  const rows = courseRows(slot)
  if (rows.length > 0) return rows
  const main = slotCourses(slot).find((c) => c.main)
  return main ? [{ course: main, key: courseKey(slot, main), caption: null }] : []
}
