// R15: pure logic of the multi-day Meal Slot edit (docs/dev/design/r15-meal-slots.md section 5).
import { sortIsoDays, weekdayShortName } from '../../../ui/WeekdayPicker/weekdays'
import { settingsStrings } from '../strings'
import type { AttendanceEntry, MealSlot, MealSlotInput, SlotBatchChange, SlotBatchRequest } from '../types'
import { coursesChanged, slotCourseInputs } from './slotCourses'

const text = settingsStrings.slot

export interface QuickPick {
  id: 'same-name' | 'every-day' | 'weekdays' | 'weekend'
  label: string
  /** ISO weekdays, ascending. */
  days: number[]
}

const key = (name: string) => name.trim().toLowerCase()

/** The Meal Slot named `name` (case and edge spaces ignored) on each chosen weekday, and the weekdays without one. */
export function matchingSlots(slots: MealSlot[], name: string, weekdays: number[]): { matched: MealSlot[]; skipped: number[] } {
  const matched: MealSlot[] = []
  const skipped: number[] = []
  for (const day of sortIsoDays(weekdays)) {
    const found = slots.find((s) => s.weekday === day && key(s.name) === key(name))
    if (found) matched.push(found)
    else skipped.push(day)
  }
  return { matched, skipped }
}

/** Editing `current`: "All days with <name>", "Weekdays", "Weekend". Adding (no current): "Every day", "Weekdays", "Weekend". */
export function quickPicks(slots: MealSlot[], current?: MealSlot): QuickPick[] {
  const first: QuickPick = current
    ? { id: 'same-name', label: text.allDaysWith(current.name.trim()), days: sortIsoDays(slots.filter((s) => key(s.name) === key(current.name)).map((s) => s.weekday)) }
    : { id: 'every-day', label: text.everyDay, days: [1, 2, 3, 4, 5, 6, 7] }
  return [first, { id: 'weekdays', label: text.weekdays, days: [1, 2, 3, 4, 5] }, { id: 'weekend', label: text.weekend, days: [6, 7] }]
}

export function sameDays(a: number[], b: number[]): boolean {
  const x = sortIsoDays(a)
  const y = sortIsoDays(b)
  return x.length === y.length && x.every((d, i) => d === y[i])
}

const sig = (att: AttendanceEntry[]) => att.map((a) => `${a.memberId}:${a.portionFactorOverride ?? ''}`).sort().join('|')

/** Only the fields that differ from `original` (name trimmed; attendance compared as a set of member and override). */
export function changedFields(original: MealSlot, draft: MealSlotInput): SlotBatchChange {
  const out: SlotBatchChange = {}
  const name = draft.name.trim()
  if (name !== original.name.trim()) out.name = name
  if (draft.time !== original.time) out.time = draft.time
  if (sig(draft.attendance) !== sig(original.attendance)) out.attendance = draft.attendance
  if (draft.courses !== undefined && coursesChanged(slotCourseInputs(original), draft.courses)) out.courses = draft.courses
  return out
}

export function hasChanges(change: SlotBatchChange): boolean {
  return change.name !== undefined || change.time !== undefined || change.attendance !== undefined || change.courses !== undefined
}

export function batchRequest(original: MealSlot, weekdays: number[], draft: MealSlotInput): SlotBatchRequest {
  return { match: original.name.trim(), weekdays: sortIsoDays(weekdays), set: changedFields(original, draft) }
}

const dayList = (days: number[], locale: string) => days.map((d) => weekdayShortName(d, locale)).join(', ')
const joinAnd = (items: string[]) => (items.length < 2 ? (items[0] ?? '') : text.and(items.slice(0, -1).join(', '), items[items.length - 1]!))

/** The summary shown before saving. */
export function summaryLines(name: string, matched: MealSlot[], skipped: number[], locale = 'en'): { update: string | null; skipped: string[] } {
  return {
    update: matched.length > 0 ? text.updateSummary(name, dayList(matched.map((s) => s.weekday), locale)) : null,
    skipped: skipped.map((d) => text.skippedDay(weekdayShortName(d, locale), name)),
  }
}

/** The sentence shown after saving. */
export function resultMessage(name: string, updated: number[], skipped: number[], locale = 'en'): string {
  const head = text.updated(name, dayList(updated, locale))
  if (skipped.length === 0) return head
  const names = skipped.map((d) => weekdayShortName(d, locale))
  return skipped.length === 1 ? `${head} ${text.skippedOne(names[0]!, name)}` : `${head} ${text.skippedMany(joinAnd(names), name)}`
}
