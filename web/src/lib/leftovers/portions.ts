// Pure defaults and rules for the Leftover sheets (no React). STUB (red).
import type { LeftoverClaim, LeftoverPlace } from './types'

export const PORTION_STEP = 0.5

export interface StepperBounds {
  min: number
  max: number
  step: number
}

/** Had it: default one portion (or what is left if less). */
export function hadItDefault(_left: number): number {
  return 0
}

/** Threw it out: default all that is left. */
export function throwOutDefault(_left: number): number {
  return 0
}

/** The stepper: 0.5 steps, 0.5 up to what is left. */
export function portionBounds(_left: number): StepperBounds {
  return { min: 0, max: 0, step: 0 }
}

/** Freeze it: default the portions no Planned Meal is planned to use; all of them when every portion is planned. */
export function freezeDefaultPortions(_left: number, _plannedPortions: number): number {
  return 0
}

/** Storage Places of kind freezer, by name. */
export function freezerPlaces(_places: LeftoverPlace[]): LeftoverPlace[] {
  return []
}

/** Take out: the places that are not a freezer, by name (Not sorted is the sheet's own null choice). */
export function takeOutPlaces(_places: LeftoverPlace[]): LeftoverPlace[] {
  return []
}

/** Freeze it defaults to the default Storage Place if it is a freezer, else the first freezer by name; null with none. */
export function defaultFreezer(_places: LeftoverPlace[]): LeftoverPlace | null {
  return null
}

/** Use-by after Freeze it: today + the Recipe's Frozen Use-by, else the Household's. */
export function freezeUseBy(_today: string, _recipeDays: number | null, _householdDays: number): { date: string; days: number } {
  return { date: '', days: 0 }
}

/** Use-by after Take out: today + the Recipe's Use-by days. */
export function takeOutUseBy(_today: string, _useByDays: number): { date: string; days: number } {
  return { date: '', days: 0 }
}

/** Planned Meals (claims, soonest first) that cannot keep their portions when `left` portions remain: they are replanned. */
export function lostClaims(_claims: LeftoverClaim[], _left: number): LeftoverClaim[] {
  return []
}
