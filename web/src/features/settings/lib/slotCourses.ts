// A Meal Slot's Courses in the editor: the draft, its edits, the problems, the overview line and the removal preview.
// Plain TypeScript, no React. Rules: functional-spec 3.1.
import { COURSES_EMPTY_MESSAGE, type CourseChoice } from '../../../lib/courses'
import { weekdayShortName } from '../../../ui/WeekdayPicker/weekdays'
import { coursesStrings } from '../coursesStrings'
import type { AttendanceEntry, MealSlot, Member, SlotCourseInput, SlotRemoves } from '../types'
import { plannedMealText } from './courseRemoval'

const NOT_OPTIONAL_MESSAGE = coursesStrings.slot.allOptional

const sameIds = (a: readonly number[], b: readonly number[]) => {
  const x = [...a].sort((p, q) => p - q)
  const y = [...b].sort((p, q) => p - q)
  return x.length === y.length && x.every((v, i) => v === y[i])
}

const copyOf = (c: SlotCourseInput): SlotCourseInput => ({ ...c, optOutMemberIds: [...c.optOutMemberIds] })

/** "a", "a and b", "a, b and c". */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** A new Meal Slot starts with the main Course alone, required, nobody opting out; [] when `courses` has no main Course. */
export function newSlotCourses(courses: readonly CourseChoice[]): SlotCourseInput[] {
  const main = courses.find((c) => c.main)
  return main ? [{ id: main.id, optional: false, optOutMemberIds: [] }] : []
}

/** The Courses of an existing Meal Slot as save inputs (copies; an absent `courses` is []). */
export function slotCourseInputs(slot: Pick<MealSlot, 'courses'>): SlotCourseInput[] {
  return (slot.courses ?? []).map((c) => ({ id: c.id, optional: c.optional, optOutMemberIds: [...c.optOutMemberIds] }))
}

/**
 * The picker chose `ids` (in order): a kept Course keeps its Optional flag and opt-outs, a new one starts required with nobody
 * opting out; a Course taken off loses both. Leaves `draft` alone.
 */
export function withCourseIds(draft: readonly SlotCourseInput[], ids: readonly number[]): SlotCourseInput[] {
  return ids.map((id) => {
    const kept = draft.find((c) => c.id === id)
    return kept ? copyOf(kept) : { id, optional: false, optOutMemberIds: [] }
  })
}

/** The Course's Optional flag set; other Courses untouched. */
export function withOptional(draft: readonly SlotCourseInput[], courseId: number, optional: boolean): SlotCourseInput[] {
  return draft.map((c) => (c.id === courseId ? { ...copyOf(c), optional } : copyOf(c)))
}

/** `eats` false adds the Member to the Course's opt-outs, true removes them; other Courses and other opt-outs (a Member who no longer attends too) untouched. */
export function withEater(draft: readonly SlotCourseInput[], courseId: number, memberId: number, eats: boolean): SlotCourseInput[] {
  return draft.map((c) => {
    if (c.id !== courseId) return copyOf(c)
    const others = c.optOutMemberIds.filter((id) => id !== memberId)
    const optOutMemberIds = eats ? others : c.optOutMemberIds.includes(memberId) ? [...c.optOutMemberIds] : [...others, memberId]
    return { ...copyOf(c), optOutMemberIds }
  })
}

/** The Members the pills offer: the ones in `attendance`, in the Members' own order. */
export function attendeesOf(members: readonly Member[], attendance: readonly AttendanceEntry[]): Member[] {
  return members.filter((m) => attendance.some((a) => a.memberId === m.id))
}

/** "Choose at least one Course" (COURSES_EMPTY_MESSAGE) for none, "Keep at least one Course that is not optional" when every Course is optional, else null. */
export function coursesProblem(draft: readonly SlotCourseInput[]): string | null {
  if (draft.length === 0) return COURSES_EMPTY_MESSAGE
  if (draft.every((c) => c.optional)) return NOT_OPTIONAL_MESSAGE
  return null
}

/** "Dessert · without Sam" / "Dessert · without Sam and Pia" / "Dessert · without Sam, Pia and Zio Carlo" over the attending opt-outs; null when none. */
export function eatersSummary(courseName: string, optOutNames: readonly string[]): string | null {
  return optOutNames.length === 0 ? null : `${courseName} · without ${joinList(optOutNames)}`
}

/** True when two Course lists differ in the Courses, their order, an Optional flag or an opt-out set (order of opt-outs ignored). */
export function coursesChanged(original: readonly SlotCourseInput[], draft: readonly SlotCourseInput[]): boolean {
  if (original.length !== draft.length) return true
  return original.some((o, i) => {
    const d = draft[i]!
    return o.id !== d.id || o.optional !== d.optional || !sameIds(o.optOutMemberIds, d.optOutMemberIds)
  })
}

/** The Courses of the matching slots that the new list leaves out: `{ id, name, slots }` per Course (first seen order), `slots` being the slots that lose it. */
export function courseRemovals(matched: readonly MealSlot[], draft: readonly SlotCourseInput[]): { id: number; name: string; slots: MealSlot[] }[] {
  const kept = new Set(draft.map((c) => c.id))
  const out: { id: number; name: string; slots: MealSlot[] }[] = []
  for (const slot of matched) {
    for (const course of slot.courses ?? []) {
      if (kept.has(course.id)) continue
      let entry = out.find((o) => o.id === course.id)
      if (!entry) {
        entry = { id: course.id, name: course.name, slots: [] }
        out.push(entry)
      }
      entry.slots.push(slot)
    }
  }
  return out
}

export interface RemovalPreview {
  /** "Removes Side from Tue and Thu: 3 Planned Meals and 1 Slot Rule go" (counts left out when nothing goes: "Removes Side from Tue and Thu."). */
  lines: string[]
  /** The Pinned Planned Meals that go, as "Chicken stew · Dinner · Thu 12 Nov". */
  pinned: string[]
}

/** The preview text of a dry run: per removed Course the days it goes from and what goes with it, and the Pinned meals. */
export function removalPreview(removals: ReturnType<typeof courseRemovals>, removes: SlotRemoves, locale = 'en'): RemovalPreview {
  const lines = removals.map((r) => {
    const slotIds = new Set(r.slots.map((s) => s.id))
    const days = [...r.slots]
      .sort((a, b) => a.weekday - b.weekday)
      .map((s) => weekdayShortName(s.weekday, locale))
    const meals = removes.plannedMeals.filter((m) => m.courseId === r.id && slotIds.has(m.mealSlotId)).length
    const rules = removes.slotRules.filter((x) => x.courseId === r.id && slotIds.has(x.mealSlotId)).length
    const head = `Removes ${r.name} from ${joinList([...new Set(days)])}`
    const items: string[] = []
    if (meals > 0) items.push(`${meals} Planned Meal${meals === 1 ? '' : 's'}`)
    if (rules > 0) items.push(`${rules} Slot Rule${rules === 1 ? '' : 's'}`)
    if (items.length === 0) return `${head}.`
    return `${head}: ${joinList(items)} ${meals + rules === 1 ? 'goes' : 'go'}`
  })
  const pinned = removes.plannedMeals
    .filter((m) => m.pinned && removals.some((r) => r.id === m.courseId && r.slots.some((s) => s.id === m.mealSlotId)))
    .map((m) => plannedMealText({ recipeName: m.recipeName, mealSlotName: m.mealSlotName, date: m.date }, locale))
  return { lines, pinned }
}

