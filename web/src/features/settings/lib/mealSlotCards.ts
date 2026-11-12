// MS redesign (beta.5): the Meal Slots page as one card per Meal Slot name. Pure functions, no React. STUBS: the developer fills these in
// (docs/dev/design/meal-slots-redesign.md, section "Lib"). The tests are in mealSlotCards.test.ts.
import type { WeekStart } from '../../../ui/WeekdayPicker/weekdays'
import type { MealSlot, Member } from '../types'

/** Who eats: every Member, nobody, or some of them (in the Members list order). Attendees whose Member no longer exists are ignored. */
export type CardAttendance = { state: 'everyone' } | { state: 'nobody' } | { state: 'some'; memberIds: number[] }

/** A Course a card serves. `eaters` = the Members who eat it when some of the attending Members opt out ("Dessert: Mia only"); null = all who attend. */
export interface CourseChip {
  id: number
  name: string
  optional: boolean
  eaters: number[] | null
}

/** One weekday of the 7-day strip: a day the name runs (its slot, its time, whether it differs from the card's usual) or a free day ("+ add"). */
export type WeekCell =
  | { weekday: number; state: 'runs'; slot: MealSlot; time: string; differs: boolean }
  | { weekday: number; state: 'free' }

/** A weekday of a card that differs from the card's usual; only the fields that differ are set. */
export interface DayDifference {
  weekday: number
  slot: MealSlot
  time?: string
  attendance?: CardAttendance
  courses?: CourseChip[]
}

export interface MealSlotCard {
  /** The name, trimmed and lower-cased: the group key and a stable React key. */
  key: string
  /** The name as written on the earliest weekday (edge spaces trimmed). */
  name: string
  /** ISO weekdays the name runs on, ascending (1 Monday .. 7 Sunday). */
  days: number[]
  usualTime: string
  usualAttendance: CardAttendance
  usualCourses: CourseChip[]
  /** Seven cells in week order (starting at `weekStart`). */
  week: WeekCell[]
  /** Only the weekdays that differ, in week order. */
  differences: DayDifference[]
  /** 'full' when the name runs all seven days, else 'half' (Bento sizing). */
  span: 'full' | 'half'
  /** The slot "Edit <name>" opens: the earliest weekday whose values equal the usual ones (else the earliest weekday). */
  editSlot: MealSlot
  /** The slot and date "Change a date" opens: the soonest upcoming run (today counts). */
  next: { slot: MealSlot; date: string }
}

/**
 * The most common value among `entries` (compared by `key`); on a tie the value of the earliest ISO weekday (Monday first,
 * whatever the week start) wins. `entries` is not empty.
 */
export function pickUsual<T>(_entries: Array<{ weekday: number; key: string; value: T }>): T {
  throw new Error('not implemented')
}

/** One card per Meal Slot name (case and edge spaces ignored), ordered by usual time then name. `today` is YYYY-MM-DD. */
export function buildMealSlotCards(_slots: MealSlot[], _members: Member[], _opts: { today: string; weekStart?: WeekStart }): MealSlotCard[] {
  throw new Error('not implemented')
}

/** "Every day", "Weekdays", "Weekend", a single day in full ("Sunday"), else the short names joined ("Mon, Wed"). */
export function daysLabel(_days: number[], _locale?: string): string {
  throw new Error('not implemented')
}

/** "Fabio only", "Mia, Sam only"; "Everyone"; "Nobody attending". */
export function attendanceText(_attendance: CardAttendance, _members: Member[]): string {
  throw new Error('not implemented')
}

/** The words of one "Differs on" row after the weekday: the time, who eats ("Fabio only"), the Courses ("Main only" when they are fewer than usual, else listed). */
export function differenceParts(_difference: DayDifference, _card: Pick<MealSlotCard, 'usualCourses'>, _members: Member[]): string[] {
  throw new Error('not implemented')
}

/** An upcoming date on which a Meal Slot differs from its usual (beta.5's per-date backend will fill this; Guests join it with F1). */
export interface DateException {
  date: string
  slotId: number
  slotName: string
  notServed?: boolean
  /** The time that date, when it is not the usual one. */
  time?: string
  usualTime?: string
  /** The Members who eat that date, when it is not the usual Attendance. */
  attendeeIds?: number[]
}

export type DatePart = { kind: 'notServed' } | { kind: 'time'; time: string; usualTime: string } | { kind: 'attendance'; attendeeIds: number[] }

export interface DateRow {
  key: string
  date: string
  /** "Sat 14 Nov". */
  dateLabel: string
  slotName: string
  parts: DatePart[]
}

/** The upcoming exceptions (today on) as rows, soonest first then by name; one that differs in nothing is left out. At most `limit` (default 8). */
export function datesThatDiffer(_exceptions: DateException[], _opts: { today: string; locale?: string; limit?: number }): DateRow[] {
  throw new Error('not implemented')
}

/** "Not served", "13:30 · usually 13:00", "Fabio only". */
export function datePartText(_part: DatePart, _members: Member[]): string {
  throw new Error('not implemented')
}
