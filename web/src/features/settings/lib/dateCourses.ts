// The Courses section of the Date Attendance sheet: per Course opt-outs for one date. Plain TypeScript, no React. STUB (CRS D2 design step).
import type { AttendanceEntry, DateCourse, DateCourseChange } from '../types'

const nope = (): never => {
  throw new Error('not implemented')
}

export interface DateCourseDraft {
  courseId: number
  name: string
  optOutMemberIds: number[]
  /** The date has its own opt-outs for this Course (as served, or after a pill was changed). */
  isOverride: boolean
}

/** The draft the sheet starts from: one entry per Course of the date, in the slot's order. */
export function dateCourseDrafts(_courses: readonly DateCourse[]): DateCourseDraft[] {
  return nope()
}

/** A pill changed: the Course now has its own opt-outs for the date (`isOverride` true). Others untouched. */
export function withDateEater(_drafts: readonly DateCourseDraft[], _courseId: number, _memberId: number, _eats: boolean): DateCourseDraft[] {
  return nope()
}

/** "Reset to usual" on a Course: its opt-outs go back to `usual` and `isOverride` is false. */
export function resetDateCourse(_drafts: readonly DateCourseDraft[], _courseId: number, _usual: readonly number[]): DateCourseDraft[] {
  return nope()
}

/**
 * What to send: per Course whose state changed since `served`, a list (it now has its own opt-outs: a different list, or newly
 * an override) or null (it was an override and is reset). A Course not changed is not named.
 */
export function dateCourseChanges(_served: readonly DateCourse[], _drafts: readonly DateCourseDraft[]): DateCourseChange[] {
  return nope()
}

/** True when two Attendance lists name the same Members with the same overrides (order ignored). */
export function sameAttendance(_a: readonly AttendanceEntry[], _b: readonly AttendanceEntry[]): boolean {
  return nope()
}

/** Whether anything is overridden for the date: the Attendance or any Course (enables "Reset to usual Attendance"). */
export function hasDateOverride(_attendance: { isOverride: boolean; courses?: readonly { isOverride: boolean }[] } | undefined): boolean {
  return nope()
}
