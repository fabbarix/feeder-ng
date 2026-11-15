// B9-46 (PC-08, SET-16): the words and models of an Away, plain TypeScript with no React. Wording follows the chapter's mocks; the
// words themselves are in strings/away.ts. Dates are ISO "YYYY-MM-DD" calendar dates of the Household (no time zone maths).
import { ApiError } from '../../../lib/http'
import { awayStrings } from '../strings/away'
import type { Away, AwayDraft, AwayPreview, AwayPreviewSlot, AwaySlotRef, PlanSlot } from '../types'

const s = awayStrings.away

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

interface Day {
  year: number
  month: number
  day: number
  /** ISO weekday: 1 Monday .. 7 Sunday. */
  weekday: number
}
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`)
function dayOf(iso: string): Day {
  const d = utc(iso)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: ((d.getUTCDay() + 6) % 7) + 1 }
}
/** ISO weekday (1 Monday .. 7 Sunday) of a date. */
export const isoWeekday = (iso: string): number => dayOf(iso).weekday
export function addDays(iso: string, n: number): string {
  const d = utc(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
/** Whole days from `a` to `b` (b − a). */
export const daysBetween = (a: string, b: string): number => Math.round((utc(b).getTime() - utc(a).getTime()) / 86_400_000)

const wd = (d: Day) => WEEKDAYS[d.weekday - 1]!
const mon = (d: Day) => MONTHS[d.month - 1]!
/** "Tue 17". */
export const dayShort = (iso: string): string => {
  const d = dayOf(iso)
  return `${wd(d)} ${d.day}`
}
/** "Tue 1 Dec". */
export const dayLong = (iso: string): string => {
  const d = dayOf(iso)
  return `${wd(d)} ${d.day} ${mon(d)}`
}
/** "Tue". */
const weekdayShort = (iso: string) => wd(dayOf(iso))

const trimNumber = (n: number) => String(Math.round(n * 100) / 100)
/** "0.5 portions", "1 portion", "1.75 portions": the number without trailing zeros. */
export const formatPortions = (n: number): string => `${trimNumber(n)} ${n === 1 ? 'portion' : 'portions'}`

/** Two days joined by an en dash: the shared tail (month, year) is said once, at the end. */
function joinDays(from: string, through: string, withWeekday: boolean, alwaysMonth: boolean): string {
  const a = dayOf(from)
  const b = dayOf(through)
  const head = (d: Day) => (withWeekday ? `${wd(d)} ${d.day}` : `${d.day}`)
  if (a.year !== b.year) return `${head(a)} ${mon(a)} ${a.year} – ${head(b)} ${mon(b)} ${b.year}`
  if (from === through) return alwaysMonth ? `${head(a)} ${mon(a)}` : head(a)
  if (a.month !== b.month) return `${head(a)} ${mon(a)} – ${head(b)} ${mon(b)}`
  if (!withWeekday) return `${a.day}–${b.day} ${mon(b)}`
  return alwaysMonth ? `${head(a)} – ${head(b)} ${mon(b)}` : `${head(a)} – ${head(b)}`
}

/** "Tue 17 – Thu 19 Nov", "Fri 27 Nov – Tue 1 Dec", "Tue 17 Nov" (one day), "From Tue 1 Dec" (no last day yet); the year only when it differs. */
export const awayRange = (a: Pick<Away, 'from' | 'through'>): string => (a.through === null ? s.contextFrom(dayLong(a.from)) : joinDays(a.from, a.through, true, true))

/** The range in Who's eating's away row, under the date's own context: "Tue 17 – Thu 19" (no month when both days are in one), "Fri 27 Nov – Tue 1 Dec", "Tue 17", "from Tue 1 Dec". The row says "Away " before it. */
export const awayRangeShort = (a: Pick<Away, 'from' | 'through'>): string => (a.through === null ? `from ${dayLong(a.from)}` : joinDays(a.from, a.through, true, false))

/** The compact range used in names: "12–19 Nov", "27 Nov – 1 Dec", "12 Nov", "from 1 Dec". */
export const awayCompact = (a: Pick<Away, 'from' | 'through'>): string => {
  if (a.through === null) {
    const d = dayOf(a.from)
    return `from ${d.day} ${mon(d)}`
  }
  return joinDays(a.from, a.through, false, true)
}

/** The Meal Slots of a date's weekday, by time. */
export function slotsOn(date: string, slots: AwaySlotRef[]): AwaySlotRef[] {
  const weekday = isoWeekday(date)
  return slots.filter((x) => x.weekday === weekday).sort((x, y) => (x.time < y.time ? -1 : x.time > y.time ? 1 : x.id - y.id))
}

/** The first Meal Slot missed on the first day: the named one, else the day's first. */
function firstMissed(a: Pick<Away, 'from' | 'fromMealSlotId'>, slots: AwaySlotRef[]): AwaySlotRef | undefined {
  const day = slotsOn(a.from, slots)
  return a.fromMealSlotId === null ? day[0] : (day.find((x) => x.id === a.fromMealSlotId) ?? slots.find((x) => x.id === a.fromMealSlotId))
}
/** The last Meal Slot missed on the last day: the named one, else the day's last. */
function lastMissed(through: string, throughMealSlotId: number | null, slots: AwaySlotRef[]): AwaySlotRef | undefined {
  const day = slotsOn(through, slots)
  return throughMealSlotId === null ? day[day.length - 1] : (day.find((x) => x.id === throughMealSlotId) ?? slots.find((x) => x.id === throughMealSlotId))
}

/** The toast's subline: "Tue 17 Breakfast – Thu 19 Dinner" (a whole-day end names the day's first or last Meal Slot). */
export const awaySpan = (a: Pick<Away, 'from' | 'fromMealSlotId' | 'through' | 'throughMealSlotId'>, slots: AwaySlotRef[]): string => {
  const first = firstMissed(a, slots)
  const start = first ? `${dayShort(a.from)} ${first.name}` : dayShort(a.from)
  if (a.through === null) return s.contextFrom(start)
  const last = lastMissed(a.through, a.throughMealSlotId, slots)
  if (a.through === a.from) {
    if (!last || !first) return start
    return first.id === last.id ? start : `${start} – ${last.name}`
  }
  return `${start} – ${last ? `${dayShort(a.through)} ${last.name}` : dayShort(a.through)}`
}

/** "Tue 17 Breakfast": a Meal Slot on a date, the From context of the sheet. */
export const slotOnDay = (date: string, mealSlotId: number, slots: AwaySlotRef[]): string => {
  const name = slots.find((x) => x.id === mealSlotId)?.name
  return name ? `${dayShort(date)} ${name}` : dayShort(date)
}

export interface AwayOption {
  /** '' is the whole day; otherwise the Meal Slot id as a string. */
  value: string
  label: string
}
/** The options of the From (`first`) or Through (`last`) select for a date: "Breakfast (whole day)", "Lunch", "Dinner"; [] when no Meal Slot is on that weekday. */
export const awaySlotOptions = (date: string, slots: AwaySlotRef[], edge: 'first' | 'last'): AwayOption[] => {
  const day = slotsOn(date, slots)
  const whole = edge === 'first' ? day[0] : day[day.length - 1]
  return day.map((x) => (x === whole ? { value: '', label: s.wholeDay(x.name) } : { value: String(x.id), label: x.name }))
}

export interface AwayDayLine {
  memberId: number
  awayId: number
  /** "Ben away all day · 1.75 portions". */
  text: string
}
export interface AwayDayModel {
  /** One line per Member who is away at every served Meal Slot of the day, under the day's name. */
  lines: AwayDayLine[]
  /** By Meal Slot id: "Ben away" (a part-day Away), or "Everyone is away" (everyone: true). */
  slotLabels: Record<number, { text: string; everyone: boolean }>
}
type DaySlot = Pick<PlanSlot, 'mealSlotId' | 'portions'> & Partial<Pick<PlanSlot, 'guests' | 'away' | 'everyoneAway' | 'notServed'>>
/** What a day tile says about Aways (the day's slots, the plan's Aways). */
export const awayDayModel = (slots: DaySlot[], aways: Away[]): AwayDayModel => {
  const served = slots.filter((x) => !x.notServed)
  const known = (id: number) => aways.find((a) => a.memberId === id)
  const once = aways.filter((a, i) => aways.findIndex((b) => b.memberId === a.memberId) === i)
  const wholeDay = served.length === 0 ? [] : once.filter((a) => served.every((x) => (x.away ?? []).includes(a.memberId)))
  // A day of several Meal Slots says a whole-day Away once, on its line; a day of one Meal Slot also labels that slot.
  const wholeIds = new Set(served.length > 1 ? wholeDay.map((a) => a.memberId) : [])
  // The portions a Member's absence leaves, Guests aside; said only when every served Meal Slot of the day has the same, and never
  // "0 portions" (B9-55: on a day everyone is away the lines say only who is away).
  const portions = [...new Set(served.map((x) => Math.round((x.portions - (x.guests ?? 0)) * 100) / 100))]
  const tail = portions.length === 1 && portions[0] !== 0 ? ` · ${formatPortions(portions[0]!)}` : ''
  const lines = wholeDay.map((a) => ({ memberId: a.memberId, awayId: a.id, text: `${s.allDay(a.memberName)}${tail}` }))
  const slotLabels: AwayDayModel['slotLabels'] = {}
  for (const x of served) {
    if (x.everyoneAway) {
      slotLabels[x.mealSlotId] = { text: s.everyoneAway, everyone: true }
      continue
    }
    const names = (x.away ?? []).filter((id) => !wholeIds.has(id)).map((id) => known(id)?.memberName).filter((n): n is string => Boolean(n))
    if (names.length > 0) slotLabels[x.mealSlotId] = { text: s.namesAway(names), everyone: false }
  }
  return { lines, slotLabels }
}

export interface AwayPreviewRow {
  key: string
  state: string
  detail: string
}
export interface AwayPreviewModel {
  summary: string
  rows: AwayPreviewRow[]
  note: string | null
}

/** "Wed Breakfast and Lunch" / "Tue Breakfast, Lunch and Dinner": a day's Meal Slots after its weekday. */
const dayMeals = (date: string, slots: AwayPreviewSlot[]) => `${weekdayShort(date)} ${s.andList(slots.map((x) => x.mealSlotName))}`

/** The "What changes" disclosure: its summary row, the R-E rows by day plus "Unchanged", and the note past the plan. `planEnd` is the plan's last date. */
export const awayPreviewModel = (p: AwayPreview, ctx: { name: string; planEnd: string }): AwayPreviewModel => {
  const inPlan = p.days.some((d) => d.slots.length > 0)
  const summary = inPlan ? s.summary(p.slotsWithout, ctx.name, p.mealsChanged) : s.nothingChanges
  const rows: AwayPreviewRow[] = []
  const unchanged: { date: string; slots: AwayPreviewSlot[] }[] = []
  for (const day of p.days) {
    const changed = day.slots.filter((x) => x.changes)
    const same = day.slots.filter((x) => !x.changes)
    if (same.length > 0) unchanged.push({ date: day.date, slots: same })
    if (changed.length === 0) continue
    const first = changed[0]!
    const alike = changed.every((x) => x.portionsBefore === first.portionsBefore && x.portionsAfter === first.portionsAfter)
    const detail = alike
      ? s.samePortions(changed.map((x) => x.mealSlotName), trimNumber(first.portionsBefore), trimNumber(first.portionsAfter))
      : s.eachPortions(changed.map((x) => `${x.mealSlotName} ${trimNumber(x.portionsBefore)} → ${trimNumber(x.portionsAfter)}`))
    rows.push({ key: dayShort(day.date), state: s.meals(changed.length), detail })
  }
  const sameCount = unchanged.reduce((n, d) => n + d.slots.length, 0)
  if (sameCount > 0) rows.push({ key: s.unchanged, state: s.mealSlots(sameCount), detail: s.staySame(unchanged.map((d) => dayMeals(d.date, d.slots)).join(', ')) })
  let note: string | null = null
  if (p.beyondHorizon) {
    const later = s.plansWithout(dayLong(p.beyondHorizon), ctx.name)
    note = inPlan ? later : `${s.planRunsTo(dayShort(ctx.planEnd))} ${later}`
  }
  return { summary, rows, note }
}

/** The toast's body: "6 meals changed to 1.75 portions: Tue Breakfast, Lunch and Dinner; Wed Dinner."; null when no meal changes. */
export const awayChangedBody = (p: AwayPreview): string | null => {
  const days = p.days.map((d) => ({ date: d.date, slots: d.slots.filter((x) => x.changes) })).filter((d) => d.slots.length > 0)
  const changed = days.flatMap((d) => d.slots)
  if (p.mealsChanged === 0 || changed.length === 0) return null
  const afters = new Set(changed.map((x) => x.portionsAfter))
  const to = afters.size === 1 ? formatPortions(changed[0]!.portionsAfter) : null
  return s.changedBody(p.mealsChanged, to, days.map((d) => dayMeals(d.date, d.slots)).join('; '))
}

export interface AwayToastWords {
  headline: string
  subline?: string
  body?: string
  /** The 4 s line after a successful Undo. */
  restored?: string
}

/** "Back from Dinner today" / "Back from Wed Breakfast": the first Meal Slot after an ended Away's last one. */
function backFrom(away: Away, slots: AwaySlotRef[], today: string): string | undefined {
  if (away.through === null || slots.length === 0) return undefined
  const day = slotsOn(away.through, slots)
  const last = lastMissed(away.through, away.throughMealSlotId, slots)
  // The next Meal Slot of that day by time (the last one missed may be named by an id of another weekday's slot of the same time).
  const next = last ? day.find((x) => x.time > last.time) : undefined
  if (next) return away.through === today ? s.backToday(next.name) : s.backFrom(`${weekdayShort(away.through)} ${next.name}`)
  for (let n = 1; n <= 7; n++) {
    const date = addDays(away.through, n)
    const first = slotsOn(date, slots)[0]
    if (first) return s.backFrom(`${weekdayShort(date)} ${first.name}`)
  }
  return undefined
}

export const awayToast = (kind: 'created' | 'changed' | 'ended' | 'removed', ctx: { away: Away; slots: AwaySlotRef[]; preview?: AwayPreview | null; today: string }): AwayToastWords => {
  const { away, slots } = ctx
  const name = away.memberName
  switch (kind) {
    case 'created': {
      const body = ctx.preview ? (awayChangedBody(ctx.preview) ?? undefined) : undefined
      return body ? { headline: s.isAway(name), subline: awaySpan(away, slots), body } : { headline: s.isAway(name), subline: awaySpan(away, slots) }
    }
    case 'changed':
      return { headline: s.changedHeadline(name), subline: awaySpan(away, slots) }
    case 'ended': {
      const back = backFrom(away, slots, ctx.today)
      return back ? { headline: s.endedHeadline(name), subline: back } : { headline: s.endedHeadline(name) }
    }
    case 'removed':
      return { headline: s.removedHeadline(name), restored: s.backHeadline(name) }
  }
}

export const awaySheetTitle = (fixedMemberName?: string): string => (fixedMemberName ? s.isAway(fixedMemberName) : s.someoneIsAway)
/** The context line under the title; `from` is "Tue 17 Breakfast". null when there is nothing to say. */
export const awaySheetContext = (x: { memberName?: string; away?: Pick<Away, 'from' | 'through'>; from?: string }): string | null => {
  if (x.away) return awayRange(x.away)
  if (x.from) return x.memberName ? s.contextMemberFrom(x.memberName, x.from) : s.contextFrom(x.from)
  return x.memberName ? s.newAway : null
}
/** The footer of the sheet: the primary's label and the one extra action (End today once started, Remove Away before). */
export const awayFooter = (away: Pick<Away, 'started'> | null): { save: string; extra: null | 'end' | 'remove' } =>
  away === null ? { save: s.saveAway, extra: null } : { save: s.save, extra: away.started ? 'end' : 'remove' }
/** The accessible names of the two extra actions: "Remove Away 12–19 Nov for Ben", "End today: Away 12–19 Nov for Ben". */
export const awayButtonNames = (away: Pick<Away, 'from' | 'through' | 'memberName'>): { remove: string; end: string } => {
  const range = awayCompact(away)
  return { remove: s.removeName(range, away.memberName), end: s.endName(range, away.memberName) }
}

export const awayDraft = (x: { today: string; slots: AwaySlotRef[]; memberId?: number; from?: { date: string; mealSlotId: number }; away?: Away }): AwayDraft => {
  if (x.away) {
    const a = x.away
    return { memberId: a.memberId, from: a.from, fromMealSlotId: a.fromMealSlotId, through: a.through ?? a.from, throughMealSlotId: a.throughMealSlotId, noLastDay: a.through === null }
  }
  if (x.from) {
    const first = slotsOn(x.from.date, x.slots)[0]
    const fromMealSlotId = first && first.id === x.from.mealSlotId ? null : x.from.mealSlotId
    return { memberId: x.memberId ?? null, from: x.from.date, fromMealSlotId, through: x.from.date, throughMealSlotId: null, noLastDay: false }
  }
  return { memberId: x.memberId ?? null, from: x.today, fromMealSlotId: null, through: x.today, throughMealSlotId: null, noLastDay: false }
}
/** The request body of a create or a PATCH. A started Away's PATCH leaves the first day out; "No last day yet" is `through: null` in a PATCH and absent in a create. */
export const awayBody = (d: AwayDraft, mode: 'create' | 'patch', opts?: { started?: boolean }): Record<string, unknown> => {
  const first = mode === 'patch' && opts?.started ? {} : { from: d.from, fromMealSlotId: d.fromMealSlotId }
  if (d.noLastDay) return mode === 'create' ? first : { ...first, through: null, throughMealSlotId: null }
  return { ...first, through: d.through, throughMealSlotId: d.throughMealSlotId }
}

/** A new first day: a last day before it follows it, and the Meal Slots that are not on the new weekdays go back to the whole day. */
export function withFirstDay(d: AwayDraft, from: string, slots: AwaySlotRef[]): AwayDraft {
  const through = d.through < from ? from : d.through
  const onDay = (date: string, id: number | null) => (id !== null && slotsOn(date, slots).some((x) => x.id === id) ? id : null)
  return { ...d, from, fromMealSlotId: onDay(from, d.fromMealSlotId), through, throughMealSlotId: onDay(through, d.throughMealSlotId) }
}
/** A new last day: the Through Meal Slot stays only when it is on that weekday. */
export function withLastDay(d: AwayDraft, through: string, slots: AwaySlotRef[]): AwayDraft {
  const id = d.throughMealSlotId
  return { ...d, through, throughMealSlotId: id !== null && slotsOn(through, slots).some((x) => x.id === id) ? id : null }
}

/** The sheet's fields an error can sit at. */
export type AwayField = 'first' | 'fromSlot' | 'last' | 'throughSlot'
/**
 * Where a refused write (or dry run) shows its message: an overlap or a last day before the first at Last day (First day when there is
 * no last day), a past first day at First day, otherwise by the server's `field`. null: not a field's error (a toast says it).
 */
export function awayErrorField(err: unknown, noLastDay: boolean): AwayField | null {
  if (!(err instanceof ApiError) || err.status !== 422) return null
  const reason = typeof err.details['reason'] === 'string' ? err.details['reason'] : ''
  const field = typeof err.details['field'] === 'string' ? err.details['field'] : ''
  const lastOrFirst: AwayField = noLastDay ? 'first' : 'last'
  if (reason === 'overlap' || reason === 'last_before_first') return lastOrFirst
  if (reason === 'first_day_past' || reason === 'away_started') return 'first'
  if (field === 'fromMealSlotId') return 'fromSlot'
  if (field === 'throughMealSlotId') return noLastDay ? 'fromSlot' : 'throughSlot'
  if (field === 'through') return lastOrFirst
  if (field === 'from') return 'first'
  return null
}
