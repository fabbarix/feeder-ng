import type { PlannedMeal, PlanSlot } from '../types'

/** 'upcoming' before the slot time, 'awaiting' once it has passed (the hero then asks "... cooked?"). */
export type HeroPhase = 'upcoming' | 'awaiting'

export function heroPhase(_slot: PlanSlot, _now: Date): HeroPhase {
  throw new Error('not implemented (WP6)')
}

/** Overline of the hero: the Meal Slot and its time, "DINNER · 19:30". */
export function heroOverline(_slot: PlanSlot): string {
  throw new Error('not implemented (WP6)')
}

/** Label of the Cook button: "Cook · 45 min", or "Cook" when the duration is not known. */
export function heroCookLabel(_meal: PlannedMeal): string {
  throw new Error('not implemented (WP6)')
}

/** "start 18:45" when the meal knows when to start, else null. */
export function heroStartBy(_meal: PlannedMeal): string | null {
  throw new Error('not implemented (WP6)')
}
