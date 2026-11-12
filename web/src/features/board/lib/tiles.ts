// Pure helpers behind the kitchen board's tiles. Plain TypeScript, no React.
import type { CourseLike, LeftoverLike, SlotLike, StockTotalLike } from '../types'

const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

/** Planned Meals (state planned) on the slots of one date, by `at` then Meal Slot id. */
function plannedOn(slots: SlotLike[], date: string): SlotLike[] {
  return slots
    .filter((s) => s.date === date && hasPlanned(s))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.mealSlotId - b.mealSlotId)
}

/** The YYYY-MM-DD date after `date` (UTC arithmetic, independent of the browser zone). */
function dayAfter(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + 1)).toISOString().slice(0, 10)
}

/**
 * Tonight's Planned Meal: of today's slots (date === today) that have a meal
 * in state planned, the first whose `at` is not before nowIso minus 2 hours
 * (a meal that started less than 2 h ago is still tonight's); if all are
 * earlier, none. Sorted by `at`, then mealSlotId. Null when nothing qualifies.
 */
export function tonightMeal(slots: SlotLike[], today: string, nowIso: string): SlotLike | null {
  const floor = Date.parse(nowIso) - TWO_HOURS_MS
  return plannedOn(slots, today).find((s) => Date.parse(s.at) >= floor) ?? null
}

/** The Planned Meals (state planned) of the day after `today`, by `at` then mealSlotId. */
export function tomorrowMeals(slots: SlotLike[], today: string): SlotLike[] {
  return plannedOn(slots, dayAfter(today))
}

/** R13: tomorrow's Planned Meals plus the meals the planner could not plan (no meal, a recorded reason), by time. Read-only. */
export function tomorrowSlots(slots: SlotLike[], today: string): SlotLike[] {
  const date = dayAfter(today)
  return slots
    .filter((s) => s.date === date && (hasPlanned(s) || (s.meal === null && !!s.unfilled)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.mealSlotId - b.mealSlotId)
}

export interface LeftoverRow {
  id: number
  recipeName: string
  portions: number
  useBy: string
}

/** Leftovers with portions > 0, soonest Use-by first (then by recipe name), at most `max`. */
export function leftoverRows(leftovers: LeftoverLike[], max: number): LeftoverRow[] {
  return leftovers
    .filter((l) => l.portions > 0)
    .sort((a, b) => (a.useBy < b.useBy ? -1 : a.useBy > b.useBy ? 1 : a.recipeName.localeCompare(b.recipeName)))
    .slice(0, max)
    .map((l) => ({ id: l.id, recipeName: l.recipeName, portions: l.portions, useBy: l.useBy }))
}

/** Ingredients flagged useSoon, soonest go-off first then name, at most `max`. */
export function useSoonRows(totals: StockTotalLike[], max: number): StockTotalLike[] {
  return totals
    .filter((t) => t.useSoon)
    .sort((a, b) => {
      const ga = a.nextGoesOff ?? '￿'
      const gb = b.nextGoesOff ?? '￿'
      if (ga !== gb) return ga < gb ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    .slice(0, max)
}

/** "18:42" in 24-hour time in the given IANA zone. */
export function clockText(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(now)
}

/** "Monday 9 November" style long date in the zone, English. */
export function dateText(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('weekday')} ${get('day')} ${get('month')}`
}

/** Milliseconds from now until nextChangeAt, never negative, capped at 24 h (so a bad value cannot sleep forever). */
export function msUntil(nextChangeAt: string, nowMs: number): number {
  const target = Date.parse(nextChangeAt)
  if (Number.isNaN(target)) return 0
  return Math.min(DAY_MS, Math.max(0, target - nowMs))
}

/** "in 3 h", "in 45 min", "now" (due within a minute or overdue): how soon an Advance Step must start. */
export function dueText(dueAt: string, nowMs: number, timeZone = 'UTC'): string {
  const due = Date.parse(dueAt)
  const minutes = (due - nowMs) / MINUTE_MS
  if (minutes < 1) return 'now'
  if (minutes < 60) return `in ${Math.floor(minutes)} min`
  if (due - nowMs < DAY_MS) return `in ${Math.floor(minutes / 60)} h`
  const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).formatToParts(due)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('weekday')} ${get('hour')}:${get('minute')}`
}

/**
 * Where the big "Start Cook Mode" button goes: tonight's meal, else the next
 * planned meal from now on (any day, `at` not before now), else null (the
 * button is disabled). Returns the path "/cook/meal/<date>/<mealSlotId>".
 */
export function startCookPath(slots: SlotLike[], today: string, nowIso: string): string | null {
  const tonight = tonightMeal(slots, today, nowIso)
  const now = Date.parse(nowIso)
  const next =
    tonight ??
    slots
      .filter((s) => hasPlanned(s) && Date.parse(s.at) >= now)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.mealSlotId - b.mealSlotId)[0] ??
    null
  return next ? `/cook/meal/${next.date}/${next.mealSlotId}` : null
}

/** Short weekday name ("Thu") of a YYYY-MM-DD date, independent of the browser zone. */
export function shortWeekday(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)))
}

// ---- CRS F: Courses on the board (spec 7.5). ----

/** A row of the Tonight tile: one Course with a Planned Meal. */
export interface TonightRow {
  courseId: number
  courseName: string
  recipeName: string
  main: boolean
  state: 'planned' | 'cooked' | 'skipped'
}

/** The board's slots: the payload's `slots` when it has them, else the plan's slots (an older payload). */
export function boardSlots(slots: SlotLike[] | undefined, planSlots: SlotLike[]): SlotLike[] {
  return slots ?? planSlots
}

/**
 * True when any Course of the slot holds a Planned Meal still to cook (state planned). Without `courses` it is the
 * slot's `meal`. Tonight's, tomorrow's and the Cook button's choices use this instead of `slot.meal` alone, so a slot
 * whose main Course is already Cooked but whose Side is not is still tonight's.
 */
export function hasPlanned(slot: SlotLike): boolean {
  if (!slot.courses) return slot.meal?.state === 'planned'
  return slot.courses.some((c) => c.meal?.state === 'planned')
}

/**
 * The Tonight tile's rows in the slot's order: every Course with a Planned Meal that is not Not cooked (covered,
 * not-served and empty Courses have none). A slot without `courses` gives one row from `meal`.
 */
export function tonightRows(slot: SlotLike): TonightRow[] {
  if (!slot.courses) {
    return slot.meal && slot.meal.state !== 'skipped' ? [{ courseId: 0, courseName: 'Main', recipeName: slot.meal.recipeName, main: true, state: slot.meal.state }] : []
  }
  return slot.courses
    .filter((c): c is CourseLike & { meal: NonNullable<CourseLike['meal']> } => c.meal !== null && c.meal.state !== 'skipped')
    .map((c) => ({ courseId: c.courseId, courseName: c.name, recipeName: c.meal.recipeName, main: c.main, state: c.meal.state }))
}

/**
 * Tomorrow's line of a slot. One Course (or no `courses`): "Dinner · Chicken stew" exactly as before. Several rows:
 * "Dinner: Roast chicken + green beans" (slot name, colon, the Recipe names of the Courses that hold a Planned Meal
 * joined by " + " exactly as named, in the slot's order). A covered slot is its Whole meal alone, plus any Course of
 * it that holds a Planned Meal.
 */
export function tomorrowLine(slot: SlotLike): string {
  const names = (slot.courses ?? [{ meal: slot.meal }])
    .map((c) => c.meal)
    .filter((m): m is NonNullable<typeof m> => m !== null && m.state === 'planned')
    .map((m) => m.recipeName)
  if (names.length === 0) return slot.name
  if (names.length === 1) return `${slot.name} · ${names[0]}`
  return `${slot.name}: ${names.join(' + ')}`
}
