// B9-46 (SET-16): Away on the Members list and in the Member sheet. Plain TypeScript; the words and the date forms are PC-08's
// (plan/lib/away, plan/strings/away), so the list, the sheet and the Plan say an Away the same way.
import { addDays, awayCompact, awayRange, awayRangeShort, daysBetween, dayLong, slotsOn } from '../../plan/lib/away'
import { awayStrings } from '../../plan/strings/away'
import type { Away, AwaySlotRef } from '../../plan/types'
import type { AttendanceEntry, DateAway } from '../types'

const s = awayStrings.away

/** Running (started, or no last day before today) or coming. */
const current = (a: Away, today: string) => a.through === null || a.through >= today

/** The Members list's meta line (info tone): "Away 20–27 Nov", "Away until Sun 16 Nov", "Away from Tue 1 Dec", "… · +1 more"; null when none is current or coming. */
export const awayMeta = (aways: Away[], today: string): string | null => {
  const live = liveAways(aways, today)
  const words = awayMetaCompact(aways, today)
  if (!words) return null
  return live.length > 1 ? `${words} · ${s.metaMore(live.length - 1)}` : words
}
const liveAways = (aways: Away[], today: string) => aways.filter((a) => current(a, today)).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
/** The next Away alone ("Away until Mon 16 Nov"), for a narrow row; the full line stays the row's name. */
export const awayMetaCompact = (aways: Away[], today: string): string | null => {
  const next = liveAways(aways, today)[0]
  if (!next) return null
  return next.through === null ? s.metaFrom(dayLong(next.from)) : next.started ? s.metaUntil(dayLong(next.through)) : s.metaRange(awayCompact(next))
}

export interface AwayRowModel {
  /** "Thu 19 – Thu 26 Nov", "From Tue 1 Dec". */
  title: string
  /** "in 4 days", "today", "now" (running). */
  state: string
  /** "24 Meal Slots · whole days", "From Dinner · 22 Meal Slots", "No last day yet". */
  detail: string
}

/** The Meal Slots an Away with a last day covers: every Meal Slot of its days, from the first missed to the last missed. */
function coveredSlots(a: Away, through: string, slots: AwaySlotRef[]): number {
  let n = 0
  for (let date = a.from; date <= through; date = addDays(date, 1)) {
    const day = slotsOn(date, slots)
    let from = 0
    let to = day.length - 1
    if (date === a.from && a.fromMealSlotId !== null) from = Math.max(0, day.findIndex((x) => x.id === a.fromMealSlotId))
    if (date === through && a.throughMealSlotId !== null) {
      const at = day.findIndex((x) => x.id === a.throughMealSlotId)
      if (at >= 0) to = at
    }
    n += Math.max(0, to - from + 1)
    if (daysBetween(a.from, date) > 3660) break
  }
  return n
}
const nameOf = (slots: AwaySlotRef[], id: number | null) => (id === null ? undefined : slots.find((x) => x.id === id)?.name)

export const awayRow = (away: Away, today: string, slots: AwaySlotRef[]): AwayRowModel => {
  const days = daysBetween(today, away.from)
  const state = away.started ? s.now : days <= 0 ? s.today : s.inDays(days)
  const from = nameOf(slots, away.fromMealSlotId)
  let detail: string
  if (away.through === null) {
    detail = from ? `${s.fromNamed(from)} · ${s.noLastDayDetail}` : s.noLastDayDetail
  } else {
    const count = s.mealSlots(coveredSlots(away, away.through, slots))
    const through = nameOf(slots, away.throughMealSlotId)
    if (from && through) detail = `${s.fromThrough(from, through)} · ${count}`
    else if (from) detail = `${s.fromNamed(from)} · ${count}`
    else if (through) detail = `${s.throughNamed(through)} · ${count}`
    else detail = `${count} · ${s.wholeDays}`
  }
  return { title: awayRange(away), state, detail }
}
/** The row's accessible name: "Away Thu 19 – Thu 26 Nov, in 4 days, 24 Meal Slots · whole days". */
export const awayRowName = (row: AwayRowModel): string => s.rowName(row.title, row.state, row.detail)

/** The Member row's accessible name with its Away line: "Marco, Away 20–27 Nov". */
export const memberRowName = (name: string, meta: string | null): string => (meta ? s.memberRowName(name, meta) : name)


/** Who's eating's away row: "Away Thu 12 – Sat 14" (the date's month is the sheet's own context). */
export const dateAwayLine = (a: Pick<DateAway, 'from' | 'through'>): string => s.awayRow(awayRangeShort(a))

/**
 * PC-08 step 3: the entries that eat at a date: an Away removes its Member unless the date marks them "Eats here anyway"
 * (`despiteAway`). The portions are counted from these.
 */
export function presentAttendance(entries: AttendanceEntry[], away: readonly Pick<DateAway, 'memberId'>[] | undefined): AttendanceEntry[] {
  if (!away || away.length === 0) return entries
  const ids = new Set(away.map((a) => a.memberId))
  return entries.filter((e) => !ids.has(e.memberId) || e.despiteAway === true)
}

/** "Eats here anyway" switched for one Member: on adds (or marks) their entry; off clears the mark and keeps the usual entry. */
export function withDespiteAway(entries: AttendanceEntry[], memberId: number, on: boolean): AttendanceEntry[] {
  const at = entries.findIndex((e) => e.memberId === memberId)
  if (on) {
    if (at < 0) return [...entries, { memberId, portionFactorOverride: null, despiteAway: true }]
    return entries.map((e, i) => (i === at ? { ...e, despiteAway: true } : e))
  }
  return entries.map((e, i) => {
    if (i !== at) return e
    const { despiteAway: _drop, ...rest } = e
    return rest
  })
}
