// B9-51 (PC-14 and amendment A2): the Earliest start and the Latest start of the Household, as Planning rules shows and saves them.
// Plain TypeScript, no React. canStartAt mirrors the Go planner's outsideStartWindow (internal/planner/candidates.go).
import { formatMinutes } from '../../../lib/time/formatMinutes'
import { cookingTimesStrings as s } from './planningRulesStrings'

export const DEFAULT_EARLIEST_START = '06:30'
export const DEFAULT_LATEST_START = '22:00'

/** null is Off. */
export interface CookingTimes {
  earliestStart: string | null
  latestStart: string | null
}

const DAY = 24 * 60

/** "HH:MM" to minutes after midnight; null for Off or a malformed value. */
function clockMinutes(hhmm: string | null | undefined): number | null {
  const m = hhmm ? /^(\d{1,2}):(\d{2})$/.exec(hhmm) : null
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** The two fields of GET /api/household/settings. null is Off; a field the server did not send reads as its default. */
export function cookingTimesOf(settings: { earliestStart?: string | null; latestStart?: string | null }): CookingTimes {
  return {
    earliestStart: settings.earliestStart === undefined ? DEFAULT_EARLIEST_START : settings.earliestStart,
    latestStart: settings.latestStart === undefined ? DEFAULT_LATEST_START : settings.latestStart,
  }
}

/** The client check before a save: with both on, the Latest start must be later than the Earliest start (the server's 422 too). */
export function cookingTimesError(times: CookingTimes): { latestStart?: string } {
  const from = clockMinutes(times.earliestStart)
  const to = clockMinutes(times.latestStart)
  return from !== null && to !== null && to <= from ? { latestStart: s.latestNotLater } : {}
}

/** PUT /api/household/settings takes the whole settings: the stored ones, minus the server-owned timeZoneConfigured, with the two times. */
export function cookingTimesBody<S extends object>(settings: S, times: CookingTimes): Omit<S, 'timeZoneConfigured'> & CookingTimes {
  const { timeZoneConfigured: _owned, ...rest } = settings as S & { timeZoneConfigured?: unknown }
  return { ...(rest as Omit<S, 'timeZoneConfigured'>), earliestStart: times.earliestStart, latestStart: times.latestStart }
}

/**
 * Whether cooking of totalMinutes for a Meal Slot at slotTime starts inside the window (both ends allowed):
 *  - Earliest start Off, or no length: always;
 *  - Latest start Off: the start is on the day of the meal, at or after the Earliest start;
 *  - both on: the start's time of day is from the Earliest start to the Latest start, on whatever day it falls.
 */
export function canStartAt(slotTime: string, totalMinutes: number, times: CookingTimes): boolean {
  const from = clockMinutes(times.earliestStart)
  const at = clockMinutes(slotTime)
  if (from === null || at === null || totalMinutes <= 0) return true
  const start = at - totalMinutes
  const to = clockMinutes(times.latestStart)
  if (to === null) return start >= from
  const ofDay = ((start % DAY) + DAY) % DAY
  return ofDay >= from && ofDay <= to
}

/** "a", "a or b", "a, b or c". */
function either(names: string[]): string {
  if (names.length < 2) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} ${s.or} ${names[names.length - 1]}`
}

/**
 * The example under the Cooking times, from the longest Recipe with a total time: which Meal Slots it can be planned for and which
 * not, the Meal Slots once each by name, in the order of the day. null with no such Recipe or no Meal Slot.
 */
export function startExample(recipes: { name: string; totalMinutes?: number }[], slots: { name: string; time: string }[], times: CookingTimes): string | null {
  const longest = recipes
    .filter((r): r is { name: string; totalMinutes: number } => (r.totalMinutes ?? 0) > 0)
    .reduce<{ name: string; totalMinutes: number } | null>((best, r) => (best && best.totalMinutes >= r.totalMinutes ? best : r), null)
  const byName = new Map<string, string>()
  for (const slot of slots) if (!byName.has(slot.name)) byName.set(slot.name, slot.time)
  if (!longest || byName.size === 0) return null
  const day = [...byName].map(([name, time]) => ({ name, time, ok: canStartAt(time, longest.totalMinutes, times) })).sort((a, b) => a.time.localeCompare(b.time))
  const recipe = s.exampleRecipe(longest.name, formatMinutes(longest.totalMinutes))
  const allowed = day.filter((d) => d.ok)
  const refused = day.filter((d) => !d.ok).map((d) => d.name)
  if (allowed.length === 0) return s.exampleNone(recipe)
  if (refused.length === 0) return s.exampleAny(recipe)
  const firstAllowed = day.findIndex((d) => d.ok)
  const isLaterPart = day.slice(firstAllowed).every((d) => d.ok)
  const first = day[firstAllowed]!
  return isLaterPart ? s.exampleFrom(recipe, first.name, first.time, either(refused)) : s.exampleSome(recipe, either(allowed.map((d) => d.name)), either(refused))
}
