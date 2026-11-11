// A Meal Slot's Courses in the editor: the draft, its edits, the problems, the overview line and the removal preview.
// Plain TypeScript, no React. STUB (CRS D2 design step). Rules: functional-spec 3.1.
import type { CourseChoice } from '../../../lib/courses'
import type { AttendanceEntry, MealSlot, Member, SlotCourse, SlotCourseInput, SlotRemoves } from '../types'

const nope = (): never => {
  throw new Error('not implemented')
}

/** A new Meal Slot starts with the main Course alone, required, nobody opting out; [] when `courses` has no main Course. */
export function newSlotCourses(_courses: readonly CourseChoice[]): SlotCourseInput[] {
  return nope()
}

/** The Courses of an existing Meal Slot as save inputs (copies; an absent `courses` is []). */
export function slotCourseInputs(_slot: Pick<MealSlot, 'courses'>): SlotCourseInput[] {
  return nope()
}

/**
 * The picker chose `ids` (in order): a kept Course keeps its Optional flag and opt-outs, a new one starts required with nobody
 * opting out; a Course taken off loses both. Leaves `draft` alone.
 */
export function withCourseIds(_draft: readonly SlotCourseInput[], _ids: readonly number[]): SlotCourseInput[] {
  return nope()
}

/** The Course's Optional flag set; other Courses untouched. */
export function withOptional(_draft: readonly SlotCourseInput[], _courseId: number, _optional: boolean): SlotCourseInput[] {
  return nope()
}

/** `eats` false adds the Member to the Course's opt-outs, true removes them; other Courses and other opt-outs (a Member who no longer attends too) untouched. */
export function withEater(_draft: readonly SlotCourseInput[], _courseId: number, _memberId: number, _eats: boolean): SlotCourseInput[] {
  return nope()
}

/** The Members the pills offer: the ones in `attendance`, in the Members' own order. */
export function attendeesOf(_members: readonly Member[], _attendance: readonly AttendanceEntry[]): Member[] {
  return nope()
}

/** "Choose at least one Course" (COURSES_EMPTY_MESSAGE) for none, "Keep at least one Course that is not optional" when every Course is optional, else null. */
export function coursesProblem(_draft: readonly SlotCourseInput[]): string | null {
  return nope()
}

/** "Dessert · without Sam" / "Dessert · without Sam and Pia" / "Dessert · without Sam, Pia and Zio Carlo" over the attending opt-outs; null when none. */
export function eatersSummary(_courseName: string, _optOutNames: readonly string[]): string | null {
  return nope()
}

/**
 * The overview line under a Meal Slot's name: "Main · Side without Sam · Dessert (optional)". Optional comes first, then
 * "without ...". Only opt-outs of Members in `attendance` count. '' when the slot has no Courses.
 */
export function courseOverviewLine(_courses: readonly SlotCourse[], _members: readonly Member[], _attendance: readonly AttendanceEntry[]): string {
  return nope()
}

/** True when two Course lists differ in the Courses, their order, an Optional flag or an opt-out set (order of opt-outs ignored). */
export function coursesChanged(_original: readonly SlotCourseInput[], _draft: readonly SlotCourseInput[]): boolean {
  return nope()
}

/** The Courses of the matching slots that the new list leaves out: `{ id, name, slots }` per Course (first seen order), `slots` being the slots that lose it. */
export function courseRemovals(_matched: readonly MealSlot[], _draft: readonly SlotCourseInput[]): { id: number; name: string; slots: MealSlot[] }[] {
  return nope()
}

export interface RemovalPreview {
  /** "Removes Side from Tue and Thu: 3 Planned Meals and 1 Slot Rule go" (counts left out when nothing goes: "Removes Side from Tue and Thu."). */
  lines: string[]
  /** The Pinned Planned Meals that go, as "Chicken stew · Dinner · Thu 12 Nov". */
  pinned: string[]
}

/** The preview text of a dry run: per removed Course the days it goes from and what goes with it, and the Pinned meals. */
export function removalPreview(_removals: ReturnType<typeof courseRemovals>, _removes: SlotRemoves, _locale?: string): RemovalPreview {
  return nope()
}
