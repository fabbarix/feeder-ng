// Pure helpers behind the kitchen board's tiles. Plain TypeScript, no React.
import { boardStrings } from '../strings'
import type { CourseLike, LeftoverLike, NextAdvance, SlotLike, StockTotalLike } from '../types'

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

/** The Planned Meals (state planned) of the day after `today`, by `at` then mealSlotId. */
export function tomorrowMeals(slots: SlotLike[], today: string): SlotLike[] {
  return plannedOn(slots, dayAfter(today))
}

/** R13: tomorrow's Planned Meals plus the meals the planner could not plan (no meal, a recorded reason) and Not served slots (B5-F1), by time. Read-only. */
export function tomorrowSlots(slots: SlotLike[], today: string): SlotLike[] {
  const date = dayAfter(today)
  return slots
    .filter((s) => s.date === date && (hasPlanned(s) || s.notServed === true || (s.courses ?? []).some((c) => !!c.unfilled)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.mealSlotId - b.mealSlotId)
}

export interface LeftoverRow {
  id: number
  recipeName: string
  portions: number
  useBy: string
  toAnswer?: boolean
}

/**
 * Leftovers with portions > 0, at most `max`: the questions first (past their Use-by), then soonest Use-by first (then by
 * recipe name). A frozen Leftover that is not to answer is left out: it lives on the Pantry.
 */
export function leftoverRows(leftovers: LeftoverLike[], max: number): LeftoverRow[] {
  return leftovers
    .filter((l) => l.portions > 0 && (l.toAnswer === true || l.frozen !== true))
    .sort(
      (a, b) =>
        Number(b.toAnswer === true) - Number(a.toAnswer === true) ||
        (a.useBy < b.useBy ? -1 : a.useBy > b.useBy ? 1 : a.recipeName.localeCompare(b.recipeName)),
    )
    .slice(0, max)
    .map((l) => ({ id: l.id, recipeName: l.recipeName, portions: l.portions, useBy: l.useBy, toAnswer: l.toAnswer === true }))
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
 * True when any Course of the slot holds a Planned Meal still to cook (state planned). Without `courses` it is false.
 * Tomorrow's choice uses this instead of `slot.meal` alone, so a slot
 * whose main Course is already Cooked but whose Side is not is still tonight's.
 */
export function hasPlanned(slot: SlotLike): boolean {
  return (slot.courses ?? []).some((c) => c.meal?.state === 'planned')
}

/**
 * The Tonight tile's rows in the slot's order: every Course with a Planned Meal that is not Not cooked (covered,
 * not-served and empty Courses have none). A slot without `courses` has no rows (crs-c3: no made-up main Course).
 */
export function tonightRows(slot: SlotLike): TonightRow[] {
  return (slot.courses ?? [])
    .filter((c): c is CourseLike & { meal: NonNullable<CourseLike['meal']> } => c.meal !== null && c.meal.state !== 'skipped')
    .map((c) => ({ courseId: c.courseId, courseName: c.name, recipeName: c.meal.recipeName, main: c.main, state: c.meal.state }))
}

/**
 * B9-47 (TB-08, spec 7.5): Tomorrow's line of a slot, one format for every slot: "Breakfast: Potato gratin", "Dinner: Roast chicken +
 * green beans" (the Recipe names of the Courses that hold a Planned Meal, joined by " + " as named, in the slot's order). A covered
 * slot is its Whole meal alone, plus any Course of it that holds a Planned Meal. A Not served slot is "Dinner · Not served".
 */
export function tomorrowLine(slot: SlotLike): string {
  if (slot.notServed === true) return notServedLine(slot)
  const names = plannedNames(slot)
  return names.length === 0 ? slot.name : `${slot.name}: ${names.join(' + ')}`
}

/** The Recipe names of the slot's Courses that hold a Planned Meal (state planned), in the slot's order. */
export function plannedNames(slot: SlotLike): string[] {
  return (slot.courses ?? [])
    .map((c) => c.meal)
    .filter((m): m is NonNullable<typeof m> => m !== null && m.state === 'planned')
    .map((m) => m.recipeName)
}

// ---- B5-F1: a Meal Slot that is Not served on tonight or tomorrow (ADR 0014) ----

/** "Dinner · Not served". */
export function notServedLine(slot: SlotLike): string {
  return `${slot.name} · ${boardStrings.notServed}`
}

/** The slots Not served on `today`, by `at` then Meal Slot id: the Tonight tile says so instead of "Nothing planned tonight". */
export function tonightNotServed(slots: SlotLike[], today: string): SlotLike[] {
  return slots
    .filter((s) => s.date === today && s.notServed === true)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.mealSlotId - b.mealSlotId)
}

// ---- B9-47 (TB-08): the board's Leftover line, Use soon chip and Next Advance Step, in Today's words. ----

/** Whole days from household date `from` to `to` (YYYY-MM-DD, independent of the browser zone). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

/** "today" (a day already gone counts as today, as on Today), "tomorrow", else the short weekday ("Tue"). Throws on a date that is not one. */
function dayWord(date: string, today: string): string {
  const days = daysBetween(today, date)
  if (Number.isNaN(days)) throw new Error(`not a date: ${String(date)}`)
  if (days <= 0) return boardStrings.dayToday
  if (days === 1) return boardStrings.dayTomorrow
  return shortWeekday(date)
}

/** The Leftover row of the board: the name over "Use by Tue · 1.25 portions" (Today's meta; DS 5: the Use-by leads), or "Use-by passed" for one to answer. */
export function leftoverLine(row: LeftoverRow, today: string): { title: string; meta: string } {
  if (row.toAnswer === true) return { title: row.recipeName, meta: boardStrings.useByPassed }
  return { title: row.recipeName, meta: `${boardStrings.useBy(dayWord(row.useBy, today))} · ${boardStrings.portions(row.portions)}` }
}

/** The Use soon chip: "Flour · tomorrow" and its full accessible name "Flour, good until tomorrow"; just the name without a go-off date. */
export function useSoonChip(row: StockTotalLike, today: string): { label: string; name: string } {
  if (!row.nextGoesOff) return { label: row.name, name: row.name }
  const when = dayWord(row.nextGoesOff, today)
  return { label: `${row.name} · ${when}`, name: boardStrings.goodUntil(row.name, when) }
}

/** Next Advance Step's meal line: the Meal Slot's weekday first, "Tue Dinner · Cauliflower al gorgonzola". */
export function nextAdvanceMeal(next: NextAdvance): string {
  return `${shortWeekday(next.mealDate)} ${next.slotName} · ${next.recipeName}`
}

/**
 * B9-47 (P38: every button on a page has its own name): Done's accessible name, "Done: <Step text>". When another Advance Step
 * shown with it reads the same on a different meal, the name adds its meal ("Done: Soak the beans, Tue Dinner") so the two differ.
 */
export function advanceDoneName(next: NextAdvance, shown: NextAdvance[] = []): string {
  const twin = shown.some((o) => o !== next && o.text === next.text && (o.mealDate !== next.mealDate || o.mealSlotId !== next.mealSlotId))
  return twin ? boardStrings.markDoneNameWithSlot(next.text, `${shortWeekday(next.mealDate)} ${next.slotName}`) : boardStrings.markDoneName(next.text)
}
