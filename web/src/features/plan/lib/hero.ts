import type { IconName } from '../../../ui/icons'
import { planStrings as s } from '../strings'
import { heroMeal } from './days'
import { heroRow, plannedMeals } from './courses'
import { dayNumber, weekdayName } from './phrase'
import type { PlannedMeal, PlanSlot } from '../types'

/** 'upcoming' before the slot time, 'awaiting' once it has passed (the hero then asks "... cooked?"). */
export type HeroPhase = 'upcoming' | 'awaiting'

export function heroPhase(slot: PlanSlot, now: Date): HeroPhase {
  return Date.parse(slot.at) <= now.getTime() ? 'awaiting' : 'upcoming'
}

/** Overline of the hero: the Meal Slot and its time, "DINNER · 19:30". */
export function heroOverline(slot: PlanSlot): string {
  return `${slot.name.toUpperCase()} · ${slot.time}`
}

/** "45 min", "1 h", "1 h 30 min". */
function duration(minutes: number): string {
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
  const action: HeroAction = meal.servedFromLeftover ? (day === 'today' ? 'reheat' : 'leftover') : day === 'today' ? 'cook' : 'none'
  return { slot: pick, day, action }
}

/** N3: the hero overline: "DINNER · 19:30" today, "TOMORROW · LUNCH" tomorrow, "WED · LUNCH" later. */
export function heroDayOverline(sel: HeroSelection): string {
  if (sel.day === 'today') return heroOverline(sel.slot)
  const name = sel.slot.name.toUpperCase()
  const day = sel.day === 'tomorrow' ? s.tomorrow.toUpperCase() : weekdayName(sel.slot.date, 'short').toUpperCase()
  return `${day} · ${name}`
}

/** The meal the slot block shows for its Cook label and start: the hero row's Planned Meal, else the slot's alias. */
function slotHeroMeal(slot: PlanSlot): PlannedMeal | null {
  return heroRow(slot)?.course.meal ?? slot.meal
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
