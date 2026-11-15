import type { ChipStatus } from '../../../ui'
import type { IconName } from '../../../ui/icons'
import type { PlanChip } from './chips'
import { rowChips } from './rowChips'
import { planStrings as s } from '../strings'
import { heroMeal } from './days'
import { heroRow, plannedMeals, slotCourses } from './courses'
import { dayNumber, weekdayName } from './phrase'
import type { PlanEntry, PlannedMeal, PlanSlot } from '../types'

/**
 * B9-39 (TB-01): 'upcoming' before the start time, 'start-now' from the start time until the slot time, 'past' from the slot
 * time on (the hero has then moved on; the meal is To confirm's). Without a start-by there is no 'start-now'.
 */
export type HeroPhase = 'upcoming' | 'start-now' | 'past'

const MINUTE_MS = 60_000
const DAY_MINUTES = 24 * 60

/** "HH:MM" as minutes after midnight, or null. */
function minutesOf(hhmm: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** How long before the slot time a start-by of "HH:MM" is: (slot time - start-by) mod 24 h, so a start the evening before (A2) works with no time zone. */
function leadMinutes(slotTime: string, startBy: string | undefined): number | null {
  const at = minutesOf(slotTime)
  const start = minutesOf(startBy)
  if (at === null || start === null) return null
  return (((at - start) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
}

/** The slot's start-by: the timeline's (slot.startBy), else the hero meal's own. */
function slotStart(slot: PlanSlot): string | undefined {
  return slot.startBy ?? slotHeroMeal(slot)?.startBy
}

/** The instant (ms) cooking must start for the slot, or null without a start-by. */
export function heroStartAt(slot: PlanSlot): number | null {
  const lead = leadMinutes(slot.time, slotStart(slot))
  return lead === null ? null : Date.parse(slot.at) - lead * MINUTE_MS
}

export function heroPhase(slot: PlanSlot, now: Date): HeroPhase {
  const t = now.getTime()
  if (Date.parse(slot.at) <= t) return 'past'
  const start = heroStartAt(slot)
  return start !== null && start <= t ? 'start-now' : 'upcoming'
}

/** Overline of the hero: the Meal Slot and its time, "DINNER · 19:30". */
export function heroOverline(slot: PlanSlot): string {
  return `${slot.name.toUpperCase()} · ${slot.time}`
}

/** "45 min", "1 h", "1 h 30 min". */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

/** Label of the Cook button: "Cook · 45 min", or "Cook" when the duration is not known. */
export function heroCookLabel(meal: PlannedMeal): string {
  return meal.cookMinutes && meal.cookMinutes > 0 ? `${s.cook} · ${duration(meal.cookMinutes)}` : s.cook
}

/** "start 18:45" when the meal knows when to start, else null. */
export function heroStartBy(meal: PlannedMeal): string | null {
  return meal.startBy ? s.startBy(meal.startBy) : null
}

/** The Meal Slot's icon by its name (breakfast, lunch, dinner, snack; anything else is "other"). */
export function slotIcon(name: string): IconName {
  switch (name.trim().toLowerCase()) {
    case 'breakfast':
      return 'breakfast'
    case 'lunch':
      return 'lunch'
    case 'dinner':
      return 'dinner'
    case 'snack':
      return 'snack'
    default:
      return 'other'
  }
}

/**
 * What the Today hero offers: Cook (fresh meal due today), Reheat (R12: a meal of today served from a Leftover),
 * 'leftover' (a later meal served from a Leftover: the chip only), or nothing. Yes, Cooked / Adjust come from the phase.
 */
export type HeroAction = 'cook' | 'reheat' | 'leftover' | 'none'

/** Which day the hero meal is on, relative to today. */
export type HeroDay = 'today' | 'tomorrow' | 'later'

export interface HeroSelection {
  slot: PlanSlot
  day: HeroDay
  action: HeroAction
}

/** N3: the Today hero's meal and what it offers. See docs/dev/design/r10-qa-fixes.md. */
export function heroSelection(slots: PlanSlot[], now: Date, today: string): HeroSelection | null {
  const open = slots.filter((x) => plannedMeals(x).length > 0)
  const todays = heroMeal(open.filter((x) => x.date === today), now)
  const pick = todays ?? heroMeal(open.filter((x) => x.date > today), now)
  const meal = pick ? heroRow(pick)?.course.meal : null
  if (!pick || !meal) return null
  const diff = dayNumber(pick.date) - dayNumber(today)
  const day: HeroDay = diff <= 0 ? 'today' : diff === 1 ? 'tomorrow' : 'later'
  // Reheat (or the chip) only when EVERY Course still to cook is a Leftover: a fresh Course needs the timeline's Cook.
  const allLeftover = plannedMeals(pick).every((m) => m.servedFromLeftover)
  // A2: a later meal whose start has come (an overnight start) offers Cook for its own date, as today's does.
  const cookable = day === 'today' || heroPhase(pick, now) === 'start-now'
  const action: HeroAction = allLeftover ? (day === 'today' ? 'reheat' : 'leftover') : cookable ? 'cook' : 'none'
  return { slot: pick, day, action }
}

/** N3: the hero overline: "DINNER · 19:30" today, "TOMORROW · LUNCH" tomorrow, "WED · LUNCH" later. */
export function heroDayOverline(sel: HeroSelection): string {
  if (sel.day === 'today') return heroOverline(sel.slot)
  const name = sel.slot.name.toUpperCase()
  const day = sel.day === 'tomorrow' ? s.tomorrow.toUpperCase() : weekdayName(sel.slot.date, 'short').toUpperCase()
  return `${day} · ${name}`
}

/** The meal the slot block shows for its Cook label and start: the hero row's Planned Meal, else none. */
function slotHeroMeal(slot: PlanSlot): PlannedMeal | null {
  return heroRow(slot)?.course.meal ?? null
}

/**
 * CRS F: the label of the slot block's Cook button. "Cook · 30 min" from `slot.cookMinutes` (the timeline total)
 * when it is a number above 0; otherwise as `heroCookLabel(meal)` for the hero's meal (one-Course slots are unchanged).
 */
export function slotCookLabel(slot: PlanSlot): string {
  if (typeof slot.cookMinutes === 'number' && slot.cookMinutes > 0) return `${s.cook} · ${duration(slot.cookMinutes)}`
  const meal = slotHeroMeal(slot)
  return meal ? heroCookLabel(meal) : s.cook
}

/** CRS F: "start 18:45" from `slot.startBy` (the timeline start), else from the hero meal's own startBy, else null. */
export function slotStartBy(slot: PlanSlot): string | null {
  if (slot.startBy) return s.startBy(slot.startBy)
  const meal = slotHeroMeal(slot)
  return meal ? heroStartBy(meal) : null
}

export interface HeroEyebrowOptions {
  /** On Today a today slot carries no day word: the page title and date already say it (TB-01). The board keeps "Today" (TB 7). */
  onToday?: boolean
}

/**
 * DS-TODAY, B9-39 (TB-01): the hero's eyebrow as its parts: the day ("Today", "Tomorrow", else the short weekday; none for a
 * today slot on Today), the Meal Slot, and the time: "start 18:45" while the meal is upcoming and knows when to start,
 * "start now" from the start time until the slot time, else the slot time (none for tomorrow without a start-by).
 */
export function heroEyebrow(sel: HeroSelection, now: Date, opts: HeroEyebrowOptions = {}): string[] {
  const day = sel.day === 'today' ? (opts.onToday ? null : s.today) : sel.day === 'tomorrow' ? s.tomorrow : weekdayName(sel.slot.date, 'short')
  const phase = heroPhase(sel.slot, now)
  const start = phase === 'start-now' ? s.startNow : phase === 'upcoming' ? slotStartBy(sel.slot) : null
  // Tomorrow's day word replaces the slot time when no start-by is known (N3); a later day keeps its slot time.
  const time = start ?? (sel.day === 'tomorrow' ? null : sel.slot.time)
  return [day, sel.slot.name, time].filter((p): p is string => p !== null)
}

/** True when an eyebrow part is the start part ("start 18:45", "start now"); the hero sets it in its own span. */
export function isStartPart(part: string): boolean {
  return part === s.startNow || /^start \d/.test(part)
}

/**
 * B9-39 (TB-01): the line under the Courses while the timeline must start now: one Course "Ready at 19:00. <Recipe> needs
 * 6 h, so start it now."; several "Ready at 19:00. Start with <the Recipe that starts first> now.". Null in any other phase,
 * and when a lone Course has no duration or no Course knows when to start.
 */
export function heroHint(sel: HeroSelection, now: Date): string | null {
  if (heroPhase(sel.slot, now) !== 'start-now') return null
  const meals = plannedMeals(sel.slot)
  if (meals.length >= 2) {
    const leads = meals
      .map((m) => ({ m, lead: leadMinutes(sel.slot.time, m.startBy) }))
      .filter((x): x is { m: PlannedMeal; lead: number } => x.lead !== null)
      .sort((a, b) => b.lead - a.lead)
    const first = leads[0]?.m
    return first ? s.heroHint.several(sel.slot.time, first.recipeName) : null
  }
  const meal = slotHeroMeal(sel.slot)
  if (!meal || !meal.cookMinutes || meal.cookMinutes <= 0) return null
  return s.heroHint.one(sel.slot.time, meal.recipeName, duration(meal.cookMinutes))
}

const byTime = (a: PlanSlot, b: PlanSlot) => Date.parse(a.at) - Date.parse(b.at) || a.mealSlotId - b.mealSlotId

/**
 * B9-39 (TB-01): today's slots whose time has come (`at <= now`) that still have a Course to cook, as the flat To confirm
 * entries (one per Course still planned), by slot time. Cooked, Not cooked, unfilled and Not served slots are left out.
 */
export function justServed(slots: PlanSlot[], now: Date, today: string): PlanEntry[] {
  const t = now.getTime()
  return slots
    .filter((x) => x.date === today && !x.notServed && Date.parse(x.at) <= t && plannedMeals(x).length > 0)
    .sort(byTime)
    .flatMap((x) =>
      slotCourses(x)
        .filter((c) => c.meal !== null && c.meal.state === 'planned')
        .map((c): PlanEntry => ({ ...x, courseId: c.courseId, courseName: c.name, meal: c.meal, unfilled: null })),
    )
}

const slotKeyOf = (e: { date: string; mealSlotId: number }) => `${e.date}/${e.mealSlotId}`

/** To confirm on Today: the just-served entries first, then the server's, without a slot the just-served list already has. */
export function withJustServed(served: PlanEntry[], server: PlanEntry[]): PlanEntry[] {
  if (served.length === 0) return server
  const seen = new Set(served.map(slotKeyOf))
  return [...served, ...server.filter((e) => !seen.has(slotKeyOf(e)))]
}

/**
 * The instant (ms) Today's hero next changes: its start time while that is still ahead (the eyebrow turns to "start now"),
 * else its slot time (it moves on, and the slot joins To confirm). Null when there is no hero.
 */
export function heroNextChange(slots: PlanSlot[], now: Date, today: string): number | null {
  const sel = heroSelection(slots, now, today)
  if (!sel) return null
  const start = heroStartAt(sel.slot)
  return start !== null && start > now.getTime() ? start : Date.parse(sel.slot.at)
}

/** "Lunch", "Breakfast and Lunch", "Breakfast, Lunch and Snack". */
function namesList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * B9-39 (TB-01): what the polite live region says when slots join the just-served rows: "Lunch moved to To confirm.". Empty
 * on the first render (`prev` null), when nothing is new, and when a row leaves. Two Courses of one slot are one name.
 */
export function movedToConfirm(prev: { date: string; mealSlotId: number; name: string }[] | null, next: { date: string; mealSlotId: number; name: string }[]): string {
  if (prev === null) return ''
  const before = new Set(prev.map(slotKeyOf))
  const added = new Map<string, string>()
  for (const e of next) if (!before.has(slotKeyOf(e)) && !added.has(slotKeyOf(e))) added.set(slotKeyOf(e), e.name)
  return added.size === 0 ? '' : s.movedToConfirm(namesList([...added.values()]))
}

/** One chip of the hero's chip line. A why chip is a button on Today (TB-10); the start chip carries its glyph and tooltip (A2). */
export interface HeroChip {
  key: string
  kind: 'why' | 'state' | 'status'
  status?: ChipStatus
  label: string
  icon?: IconName
  title?: string
}

const HERO_CHIPS = 2

/**
 * The hero's chip line, two chips at most: the start chip of an overnight start (info "Start Tue 21:30") or of a start outside
 * the cooking times (warn "Start 02:30") first, hidden once the slot time has passed; then `lead` (the Whole meal chip, the
 * Leftover chip) and the why chips.
 */
export function heroChipLine(slot: PlanSlot, meal: PlannedMeal, now: Date, lead: PlanChip[], why: PlanChip[]): HeroChip[] {
  const start = rowChips(meal, { slotDate: slot.date }, null, { slotAt: slot.at, now: now.getTime(), everyoneAway: slot.everyoneAway })
    .filter((c) => c.key.startsWith('start:'))
    .map((c): HeroChip => ({ key: c.key, kind: 'status', status: c.status, label: c.label, icon: c.icon, title: c.title }))
  return [...start, ...lead, ...why].slice(0, HERO_CHIPS)
}
