// MS redesign (beta.5): the Meal Slots page as one card per Meal Slot name. Pure functions, no React.
// Rules: docs/dev/design/meal-slots-redesign.md ("Lib"). Every value a card shows is derived here, never in a component.
import { weekdayLongName, weekdayOrder, weekdayShortName, type WeekStart } from '../../../ui/WeekdayPicker/weekdays'
import { settingsStrings } from '../strings'
import type { MealSlot, Member, PlanDateSlot } from '../types'
import { nextDateForWeekday, weekdayOfDate } from './weekdays'

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

const text = settingsStrings.slot
const WEEKDAYS_SET = [1, 2, 3, 4, 5]
const WEEKEND_SET = [6, 7]

/**
 * The most common value among `entries` (compared by `key`); on a tie the value of the earliest ISO weekday (Monday first,
 * whatever the week start) wins. `entries` is not empty.
 */
export function pickUsual<T>(entries: Array<{ weekday: number; key: string; value: T }>): T {
  const counts = new Map<string, number>()
  for (const e of entries) counts.set(e.key, (counts.get(e.key) ?? 0) + 1)
  const ordered = [...entries].sort((a, b) => a.weekday - b.weekday)
  let best = ordered[0]!
  for (const e of ordered) if ((counts.get(e.key) ?? 0) > (counts.get(best.key) ?? 0)) best = e
  return best.value
}

const nameKey = (name: string) => name.trim().toLowerCase()

/** The Members of `members` who attend the slot, in the Members list order. */
function attendingIds(slot: MealSlot, members: Member[]): number[] {
  const ids = new Set(slot.attendance.map((a) => a.memberId))
  return members.filter((m) => ids.has(m.id)).map((m) => m.id)
}

function attendanceOf(slot: MealSlot, members: Member[]): CardAttendance {
  const ids = attendingIds(slot, members)
  if (ids.length === 0) return { state: 'nobody' }
  if (ids.length === members.length) return { state: 'everyone' }
  return { state: 'some', memberIds: ids }
}

const attendanceKey = (a: CardAttendance) => (a.state === 'some' ? `some:${a.memberIds.join(',')}` : a.state)

/** The Courses of a slot as the card shows them: an optional Course's eaters are the attending Members who do not opt out. */
function chipsOf(slot: MealSlot, members: Member[]): CourseChip[] {
  const ids = attendingIds(slot, members)
  return (slot.courses ?? []).map((c) => {
    const outs = c.optOutMemberIds.filter((id) => ids.includes(id))
    return {
      id: c.id,
      name: c.name,
      optional: c.optional,
      eaters: outs.length === 0 ? null : ids.filter((id) => !c.optOutMemberIds.includes(id)),
    }
  })
}

const chipsKey = (chips: CourseChip[]) => JSON.stringify(chips.map((c) => [c.id, c.optional, c.eaters]))

interface DayEntry {
  weekday: number
  slot: MealSlot
  time: string
  attendance: CardAttendance
  courses: CourseChip[]
}

function buildCard(list: MealSlot[], members: Member[], today: string, weekStart: WeekStart): MealSlotCard {
  const byDay = new Map<number, MealSlot>()
  const sorted = [...list].sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time) || a.id - b.id)
  for (const s of sorted) if (!byDay.has(s.weekday)) byDay.set(s.weekday, s)
  const days = [...byDay.keys()].sort((a, b) => a - b)
  const entries: DayEntry[] = days.map((weekday) => {
    const slot = byDay.get(weekday)!
    return { weekday, slot, time: slot.time, attendance: attendanceOf(slot, members), courses: chipsOf(slot, members) }
  })

  const usualTime = pickUsual(entries.map((e) => ({ weekday: e.weekday, key: e.time, value: e.time })))
  const usualAttendance = pickUsual(entries.map((e) => ({ weekday: e.weekday, key: attendanceKey(e.attendance), value: e.attendance })))
  const usualCourses = pickUsual(entries.map((e) => ({ weekday: e.weekday, key: chipsKey(e.courses), value: e.courses })))

  const differsOn = (e: DayEntry) =>
    e.time !== usualTime || attendanceKey(e.attendance) !== attendanceKey(usualAttendance) || chipsKey(e.courses) !== chipsKey(usualCourses)
  const matchesUsual = (e: DayEntry) => !differsOn(e)

  const order = weekdayOrder(weekStart)
  const inWeekOrder = [...entries].sort((a, b) => order.indexOf(a.weekday) - order.indexOf(b.weekday))

  const differences: DayDifference[] = inWeekOrder.filter(differsOn).map((e) => {
    const d: DayDifference = { weekday: e.weekday, slot: e.slot }
    if (e.time !== usualTime) d.time = e.time
    if (attendanceKey(e.attendance) !== attendanceKey(usualAttendance)) d.attendance = e.attendance
    if (chipsKey(e.courses) !== chipsKey(usualCourses)) d.courses = e.courses
    return d
  })

  const week: WeekCell[] = order.map((weekday) => {
    const e = entries.find((x) => x.weekday === weekday)
    if (!e) return { weekday, state: 'free' }
    return { weekday, state: 'runs', slot: e.slot, time: e.time, differs: differsOn(e) }
  })

  const editEntry = entries.find(matchesUsual) ?? entries[0]!
  const next = entries
    .map((e) => ({ slot: e.slot, date: nextDateForWeekday(e.weekday, today) }))
    .sort((a, b) => a.date.localeCompare(b.date))[0]!

  return {
    key: nameKey(list[0]!.name),
    name: sorted[0]!.name.trim(),
    days,
    usualTime,
    usualAttendance,
    usualCourses,
    week,
    differences,
    span: days.length === 7 ? 'full' : 'half',
    editSlot: editEntry.slot,
    next,
  }
}

/** One card per Meal Slot name (case and edge spaces ignored), ordered by usual time then name. `today` is YYYY-MM-DD. */
export function buildMealSlotCards(slots: MealSlot[], members: Member[], opts: { today: string; weekStart?: WeekStart }): MealSlotCard[] {
  const groups = new Map<string, MealSlot[]>()
  for (const s of slots) {
    const key = nameKey(s.name)
    groups.set(key, [...(groups.get(key) ?? []), s])
  }
  const cards = [...groups.values()].map((list) => buildCard(list, members, opts.today, opts.weekStart ?? 1))
  return cards.sort((a, b) => a.usualTime.localeCompare(b.usualTime) || a.name.localeCompare(b.name))
}

/** "Every day", "Weekdays", "Weekend", a single day in full ("Sunday"), else the short names joined ("Mon, Wed"). */
export function daysLabel(days: number[], locale = 'en'): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b)
  if (sorted.length === 7) return text.everyDay
  if (sorted.length === WEEKDAYS_SET.length && sorted.every((d, i) => d === WEEKDAYS_SET[i])) return text.weekdays
  if (sorted.length === WEEKEND_SET.length && sorted.every((d, i) => d === WEEKEND_SET[i])) return text.weekend
  if (sorted.length === 1) return weekdayLongName(sorted[0]!, locale)
  return sorted.map((d) => weekdayShortName(d, locale)).join(', ')
}

/** The names of the Members in `ids`, in the Members list order; Members that no longer exist are left out. */
function memberNames(ids: number[], members: Member[]): string {
  return members.filter((m) => ids.includes(m.id)).map((m) => m.name).join(', ')
}

/** "Fabio only", "Mia, Sam only"; "Everyone"; "Nobody attending". */
export function attendanceText(attendance: CardAttendance, members: Member[]): string {
  if (attendance.state === 'everyone') return text.everyone
  if (attendance.state === 'nobody') return text.nobodyAttending
  const names = memberNames(attendance.memberIds, members)
  return names ? text.onlyEats(names) : text.nobodyAttending
}

/**
 * Who eats a Course some attending Members opt out of, in whichever form is shorter: "Dessert: Mia only" or "Dessert: without Sam"
 * (a tie goes to the "only" form). `attending` is the Attendance the eaters are taken from. Null when everyone who attends eats it.
 */
export function courseEatersText(course: CourseChip, members: Member[], attending: CardAttendance = { state: 'everyone' }): string | null {
  if (course.eaters === null) return null
  const names = memberNames(course.eaters, members)
  if (!names) return null
  const only = text.courseEaters(course.name, names)
  const present = attending.state === 'everyone' ? members.map((m) => m.id) : attending.state === 'some' ? attending.memberIds : course.eaters
  const outNames = memberNames(present.filter((id) => !course.eaters!.includes(id)), members)
  if (!outNames) return only
  const without = text.courseWithout(course.name, outNames)
  return without.length < only.length ? without : only
}

/** The Courses of a day that differs: "Main only" when they are fewer than the usual ones and all of them are usual, else listed. */
function coursesText(courses: CourseChip[], usual: CourseChip[]): string {
  if (courses.length === 0) return ''
  const names = courses.map((c) => (c.optional ? `${c.name} (${text.optionalSuffix})` : c.name))
  const usualIds = new Set(usual.map((c) => c.id))
  const fewer = courses.length < usual.length && courses.every((c) => usualIds.has(c.id))
  return fewer ? text.onlyEats(names.join(' · ')) : names.join(' · ')
}

/** The words of one "Differs on" row after the weekday: the time, who eats ("Fabio only"), the Courses ("Main only" when they are fewer than usual, else listed). */
export function differenceParts(difference: DayDifference, card: Pick<MealSlotCard, 'usualCourses'>, members: Member[]): string[] {
  const parts: string[] = []
  if (difference.time !== undefined) parts.push(difference.time)
  if (difference.attendance) parts.push(attendanceText(difference.attendance, members))
  if (difference.courses) {
    const courses = coursesText(difference.courses, card.usualCourses)
    if (courses) parts.push(courses)
  }
  return parts
}

/** An upcoming date on which a Meal Slot differs from its usual: Not served, its own time, Guests (B5-F1). */
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
  /** B5-F1: Guests that date (0 = none). */
  guests?: number
}

export type DatePart = { kind: 'notServed' } | { kind: 'time'; time: string; usualTime: string } | { kind: 'attendance'; attendeeIds: number[] } | { kind: 'guests'; guests: number }

export interface DateRow {
  key: string
  date: string
  /** "Sat 14 Nov". */
  dateLabel: string
  slotName: string
  parts: DatePart[]
}

function monthShort(date: string, locale: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const at = new Date(Date.UTC(y, m - 1, d))
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(at)
  } catch {
    return new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(at)
  }
}

function dateLabel(date: string, locale: string): string {
  const day = Number(date.slice(8, 10))
  const weekday = weekdayOfDate(date)
  const short = weekday === null ? '' : weekdayShortName(weekday, locale)
  return `${short} ${day} ${monthShort(date, locale)}`.trim()
}

function partsOf(e: DateException): DatePart[] {
  if (e.notServed) return [{ kind: 'notServed' }]
  const parts: DatePart[] = []
  if (e.time !== undefined && e.time !== e.usualTime) parts.push({ kind: 'time', time: e.time, usualTime: e.usualTime ?? '' })
  if (e.attendeeIds !== undefined) parts.push({ kind: 'attendance', attendeeIds: e.attendeeIds })
  if (e.guests !== undefined && e.guests > 0) parts.push({ kind: 'guests', guests: e.guests })
  return parts
}

/** The upcoming exceptions (today on) as rows, soonest first then by name; one that differs in nothing is left out. At most `limit` (default 8). */
export function datesThatDiffer(exceptions: DateException[], opts: { today: string; locale?: string; limit?: number }): DateRow[] {
  const locale = opts.locale ?? 'en'
  const limit = opts.limit ?? 8
  return exceptions
    .filter((e) => e.date >= opts.today)
    .map((e) => ({ e, parts: partsOf(e) }))
    .filter((x) => x.parts.length > 0)
    .sort((a, b) => a.e.date.localeCompare(b.e.date) || a.e.slotName.localeCompare(b.e.slotName))
    .slice(0, limit)
    .map(({ e, parts }) => ({
      key: `${e.date}#${e.slotId}`,
      date: e.date,
      dateLabel: dateLabel(e.date, locale),
      slotName: e.slotName,
      parts,
    }))
}

/** "Not served", "13:30 · usually 13:00", "Fabio only". */
export function datePartText(part: DatePart, members: Member[]): string {
  if (part.kind === 'notServed') return text.notServed
  if (part.kind === 'time') return text.timeUsually(part.time, part.usualTime)
  if (part.kind === 'guests') return text.guests(part.guests)
  const names = memberNames(part.attendeeIds, members)
  return names ? text.onlyEats(names) : text.nobodyAttending
}

/**
 * B5-F1: the exceptions the plan shows (its slots from today on): a date with its own time (`time` differs from `usualTime`),
 * Not served, or Guests. One slot on one date per exception; a slot that differs in none of the three is left out. The Meal Slot
 * name is the slot's; `slotId` is its `mealSlotId`.
 */
export function exceptionsFromPlan(slots: PlanDateSlot[]): DateException[] {
  return slots.flatMap((sl) => {
    const guests = sl.guests ?? 0
    const notServed = sl.notServed === true
    const ownTime = sl.usualTime !== undefined && sl.time !== sl.usualTime
    if (!notServed && !ownTime && guests === 0) return []
    const exception: DateException = { date: sl.date, slotId: sl.mealSlotId, slotName: sl.name }
    if (notServed) exception.notServed = true
    if (ownTime) {
      exception.time = sl.time
      exception.usualTime = sl.usualTime
    }
    if (guests > 0) exception.guests = guests
    return [exception]
  })
}
