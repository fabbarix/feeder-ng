// B5-F1 (ADR 0014): the per-date controls of a Meal Slot block. Plain TypeScript, no React.
// Which choices show, the Not served confirm built from the dry run, the captions. docs/dev/design/b5-f1.md.
import { ApiError } from '../../../lib/http'
import { planStrings as s } from '../strings'
import type { NotServedPreview, PlanCourse, PlanSlot, RemovedMeal } from '../types'
import { weekdayName } from './phrase'

/** Which per-date choices a slot block offers. All false on a past date. */
export interface DateChoices {
  /** "Who's eating": date today or later, and a Course is still to cook (or nothing is planned yet). */
  whosEating: boolean
  /** "Not served": as whosEating, and no Course of the slot is Cooked or Not cooked (U2). Never on a slot that is already Not served. */
  notServed: boolean
  /** "Time today" / "Time on Thu": as whosEating. */
  time: boolean
  /** "Plan Dinner again": the slot is Not served and the date is today or later. */
  planAgain: boolean
}

const NONE: DateChoices = { whosEating: false, notServed: false, time: false, planAgain: false }

/** A Course counts as resolved once its Planned Meal is Cooked or Not cooked. Covered and unserved Courses are not left to cook. */
function isResolved(course: PlanCourse): boolean {
  return course.meal !== null && course.meal.state !== 'planned'
}

function servedCourses(slot: PlanSlot): PlanCourse[] {
  return (slot.courses ?? []).filter((c) => c.coveredBy === null && c.unserved === null)
}

export function dateChoices(slot: PlanSlot, today: string): DateChoices {
  if (slot.date < today) return NONE
  if (slot.notServed) return { ...NONE, planAgain: true }
  const served = servedCourses(slot)
  const anyResolved = served.some(isResolved)
  const someLeft = served.length === 0 || served.some((c) => !isResolved(c))
  return {
    whosEating: someLeft,
    notServed: !anyResolved,
    time: someLeft,
    planAgain: false,
  }
}

/** True when the slot is Not served on its date (`slot.notServed`). */
export function isNotServed(slot: PlanSlot): boolean {
  return slot.notServed === true
}

/** "Thu Dinner": the short weekday of the slot's date and the Meal Slot name. */
export function slotDayName(slot: PlanSlot): string {
  return `${weekdayName(slot.date, 'short')} ${slot.name}`
}

/** "Time today" when the slot's date is `today`, else "Time on Thu". */
export function timeChoiceLabel(slot: PlanSlot, today: string): string {
  return slot.date === today ? s.slotDate.timeToday : s.slotDate.timeOn(weekdayName(slot.date, 'short'))
}

/** The label of a date choice: as given online, "<label> · Needs a connection" offline. */
export function choiceLabel(label: string, offline: boolean): string {
  return offline ? s.slotDate.unavailable(label) : label
}

export interface ConfirmCopy {
  title: string
  body: string
  confirmLabel: string
}

function removedNote(meal: RemovedMeal): string {
  const parts: string[] = []
  if (meal.pinned) parts.push(s.slotDate.pinnedNote)
  if (meal.bought.length > 0) parts.push(s.slotDate.boughtNote(meal.bought.join(', ')))
  return parts.length > 0 ? `${meal.recipeName} (${parts.join(', ')})` : meal.recipeName
}

/** The Not served confirm: title, a body naming what goes (Pinned, Bought), and the confirm label. */
export function notServedConfirm(slot: PlanSlot, preview: NotServedPreview): ConfirmCopy {
  const dayName = slotDayName(slot)
  const removed = preview.removes.plannedMeals
  let body = s.slotDate.confirmBody(dayName)
  if (removed.length > 0) {
    body += ` ${s.slotDate.theseGo} ${removed.map(removedNote).join(', ')}.`
    if (removed.some((m) => m.bought.length > 0)) body += ` ${s.slotDate.boughtStays}`
  }
  return { title: s.slotDate.confirmTitle(dayName), body, confirmLabel: s.slotDate.notServed }
}

/** True when the dry run lists Planned Meals: only then is a confirm asked. */
export function needsNotServedConfirm(preview: NotServedPreview): boolean {
  return preview.removes.plannedMeals.length > 0
}

/** The toast after Not served: "Thu Dinner is not served" (its action is Undo). */
export function notServedToastText(slot: PlanSlot): string {
  return s.slotDate.toast(slotDayName(slot))
}

/** The compact row: "Dinner · Not served". */
export function notServedRowText(slot: PlanSlot): string {
  return s.slotDate.row(slot.name)
}

/** "Plan Dinner again". */
export function planAgainLabel(slot: PlanSlot): string {
  return s.slotDate.planAgain(slot.name)
}

/** True when the date has a time of its own (`usualTime` known and different from `time`). */
export function hasOwnTime(slot: PlanSlot): boolean {
  return slot.usualTime !== undefined && slot.time !== slot.usualTime
}

/** "20:15 · usually 19:30" when the date has its own time; null when it has the usual one (or the slot does not say). */
export function timeCaption(slot: PlanSlot): string | null {
  if (!hasOwnTime(slot)) return null
  return s.slotDate.timeCaption(slot.time, slot.usualTime!)
}

export interface TimeDialogCopy {
  title: string
  label: string
  helper: string
  /** "Back to 19:30", only when the date has its own time. */
  back: string | null
}

export function timeDialogCopy(slot: PlanSlot): TimeDialogCopy {
  const usual = slot.usualTime ?? slot.time
  return {
    title: s.slotDate.timeTitle(slotDayName(slot)),
    label: s.slotDate.timeLabel,
    helper: s.slotDate.timeHelper(usual),
    back: hasOwnTime(slot) ? s.slotDate.timeBack(usual) : null,
  }
}

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

/** Save is offered for a complete "HH:MM" that is not the time the slot already has. */
export function canSaveTime(slot: PlanSlot, draft: string): boolean {
  return HH_MM.test(draft) && draft !== slot.time
}

/** "+2 Guests", "+1 Guest"; '' for none. */
export function guestsSuffix(guests: number): string {
  return guests > 0 ? s.slotDate.guestsSuffix(guests) : ''
}

/** "Anna, Sam + 2 Guests"; "2 Guests" with no Member; the names alone with none. */
export function attendeesLine(names: string[], guests: number): string {
  if (names.length === 0) return guests > 0 ? s.slotDate.guestsCount(guests) : ''
  return guests > 0 ? `${names.join(', ')} + ${s.slotDate.guestsCount(guests)}` : names.join(', ')
}

/** The Guests note of a Planned Meal sheet: "+2 Guests" after the Members, "2 Guests" with none; '' for no Guests. */
export function guestsNote(memberCount: number, guests: number): string {
  if (guests <= 0) return ''
  return memberCount > 0 ? guestsSuffix(guests) : attendeesLine([], guests)
}

/** The Not served slots of `today`, in time order: Today's compact rows. Slots of other dates are left out. */
export function notServedToday(slots: PlanSlot[], today: string): PlanSlot[] {
  return slots
    .filter((sl) => sl.date === today && sl.notServed === true)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.mealSlotId - b.mealSlotId)
}

/** The words for a refused PATCH / PUT: date_past, slot_started, time_invalid; anything else the generic "Could not save that". */
export function slotDateErrorText(err: unknown, slot: PlanSlot | null): string {
  if (err instanceof ApiError && err.code === 'validation_failed') {
    const reason = err.details.reason
    if (reason === 'slot_started') return s.slotDate.slotStarted(slot?.name ?? 'the Meal Slot')
    if (reason === 'date_past') return s.slotDate.datePast
    if (reason === 'time_invalid') return s.slotDate.timeInvalid
  }
  return s.slotDate.failed
}
