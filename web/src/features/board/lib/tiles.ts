// Pure helpers behind the kitchen board's tiles. Plain TypeScript, no React.
import type { LeftoverLike, SlotLike, StockTotalLike } from '../types'

const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

/** Planned Meals (state planned) on the slots of one date, by `at` then Meal Slot id. */
function plannedOn(slots: SlotLike[], date: string): SlotLike[] {
  return slots
    .filter((s) => s.date === date && s.meal?.state === 'planned')
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
export function dueText(dueAt: string, nowMs: number): string {
  const minutes = (Date.parse(dueAt) - nowMs) / MINUTE_MS
  if (minutes < 1) return 'now'
  if (minutes < 60) return `in ${Math.floor(minutes)} min`
  return `in ${Math.floor(minutes / 60)} h`
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
      .filter((s) => s.meal?.state === 'planned' && Date.parse(s.at) >= now)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.mealSlotId - b.mealSlotId)[0] ??
    null
  return next ? `/cook/meal/${next.date}/${next.mealSlotId}` : null
}

/** Short weekday name ("Thu") of a YYYY-MM-DD date, independent of the browser zone. */
export function shortWeekday(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)))
}
