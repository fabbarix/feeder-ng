import type { IconName } from '../../../ui/icons'
import { planStrings as s } from '../strings'
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

/** What the Today hero offers: Cook (fresh meal due today), Yes, Cooked / Adjust come from the phase, or nothing. */
export type HeroAction = 'cook' | 'leftover' | 'none'

/** Which day the hero meal is on, relative to today. */
export type HeroDay = 'today' | 'tomorrow' | 'later'

export interface HeroSelection {
  slot: PlanSlot
  day: HeroDay
  action: HeroAction
}

/** N3: the Today hero's meal and what it offers. See docs/dev/design/r10-qa-fixes.md. */
export function heroSelection(_slots: PlanSlot[], _now: Date, _today: string): HeroSelection | null {
  throw new Error('not implemented: N3')
}

/** N3: the hero overline: "DINNER · 19:30" today, "TOMORROW · LUNCH" tomorrow, "WED · LUNCH" later. */
export function heroDayOverline(_sel: HeroSelection): string {
  throw new Error('not implemented: N3')
}
