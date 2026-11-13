// The Courses section of the Date Attendance sheet: per Course opt-outs for one date. Plain TypeScript, no React.
import type { AttendanceEntry, DateCourse, DateCourseChange } from '../types'

export interface DateCourseDraft {
  courseId: number
  name: string
  optOutMemberIds: number[]
  /** The date has its own opt-outs for this Course (as served, or after a pill was changed). */
  isOverride: boolean
}

const sameIds = (a: readonly number[], b: readonly number[]) => {
  const x = [...a].sort((p, q) => p - q)
  const y = [...b].sort((p, q) => p - q)
  return x.length === y.length && x.every((v, i) => v === y[i])
}

/** The draft the sheet starts from: one entry per Course of the date, in the slot's order. */
export function dateCourseDrafts(courses: readonly DateCourse[]): DateCourseDraft[] {
  return courses.map((c) => ({ courseId: c.courseId, name: c.name, optOutMemberIds: [...c.optOutMemberIds], isOverride: c.isOverride }))
}

/** A pill changed: the Course now has its own opt-outs for the date (`isOverride` true). Others untouched. */
export function withDateEater(drafts: readonly DateCourseDraft[], courseId: number, memberId: number, eats: boolean): DateCourseDraft[] {
  return drafts.map((d) => {
    if (d.courseId !== courseId) return { ...d, optOutMemberIds: [...d.optOutMemberIds] }
    const others = d.optOutMemberIds.filter((id) => id !== memberId)
    const optOutMemberIds = eats ? others : d.optOutMemberIds.includes(memberId) ? [...d.optOutMemberIds] : [...others, memberId]
    return { ...d, optOutMemberIds, isOverride: true }
  })
}

/** "Reset to usual" on a Course: its opt-outs go back to `usual` and `isOverride` is false. */
export function resetDateCourse(drafts: readonly DateCourseDraft[], courseId: number, usual: readonly number[]): DateCourseDraft[] {
  return drafts.map((d) => (d.courseId === courseId ? { ...d, optOutMemberIds: [...usual], isOverride: false } : { ...d, optOutMemberIds: [...d.optOutMemberIds] }))
}

/**
 * What to send: per Course whose state changed since `served`, a list (it now has its own opt-outs: a different list, or newly
 * an override) or null (it was an override and is reset). A Course not changed is not named.
 */
export function dateCourseChanges(served: readonly DateCourse[], drafts: readonly DateCourseDraft[]): DateCourseChange[] {
  const out: DateCourseChange[] = []
  for (const draft of drafts) {
    const was = served.find((c) => c.courseId === draft.courseId)
    if (!was) continue
    if (!draft.isOverride) {
      if (was.isOverride) out.push({ courseId: draft.courseId, optOutMemberIds: null })
    } else if (!sameIds(draft.optOutMemberIds, was.optOutMemberIds)) {
      out.push({ courseId: draft.courseId, optOutMemberIds: [...draft.optOutMemberIds] })
    }
  }
  return out
}

const sig = (att: readonly AttendanceEntry[]) => att.map((a) => `${a.memberId}:${a.portionFactorOverride ?? ''}`).sort().join('|')

/** True when two Attendance lists name the same Members with the same overrides (order ignored). */
export function sameAttendance(a: readonly AttendanceEntry[], b: readonly AttendanceEntry[]): boolean {
  return sig(a) === sig(b)
}

/**
 * Whether anything is overridden for the date: the Attendance, any Course or Guests (B5-F1: Reset to usual Attendance also drops the
 * Guests) (enables "Reset to usual Attendance").
 */
export function hasDateOverride(attendance: { isOverride: boolean; courses?: readonly { isOverride: boolean }[]; guests?: number } | undefined): boolean {
  if (!attendance) return false
  return attendance.isOverride || (attendance.courses ?? []).some((c) => c.isOverride) || (attendance.guests ?? 0) > 0
}
