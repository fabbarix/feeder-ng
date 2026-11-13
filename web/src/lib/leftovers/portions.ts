// Pure defaults and rules for the Leftover sheets (no React).
import { addDays } from './dates'
import type { LeftoverPlace } from './types'

export const PORTION_STEP = 0.5

export interface StepperBounds {
  min: number
  max: number
  step: number
}

/** Had it: default one portion (or what is left if less). */
export function hadItDefault(left: number): number {
  return Math.min(1, left)
}

/** Threw it out: default all that is left. */
export function throwOutDefault(left: number): number {
  return left
}

/** The stepper: 0.5 steps, 0.5 up to what is left. */
export function portionBounds(left: number): StepperBounds {
  return { min: PORTION_STEP, max: left, step: PORTION_STEP }
}

/** Freeze it: default the portions no Planned Meal is planned to use, rounded down to a 0.5 step; all of them when less than half a portion is spare. */
export function freezeDefaultPortions(left: number, plannedPortions: number): number {
  const spare = left - plannedPortions
  if (spare < PORTION_STEP) return left
  return Math.floor(spare / PORTION_STEP) * PORTION_STEP
}

const byName = (a: LeftoverPlace, b: LeftoverPlace) => a.name.localeCompare(b.name)

/** Storage Places of kind freezer, by name. */
export function freezerPlaces(places: LeftoverPlace[]): LeftoverPlace[] {
  return places.filter((p) => p.kind === 'freezer').sort(byName)
}

/** Take out: the places that are not a freezer, by name (Not sorted is the sheet's own null choice). */
export function takeOutPlaces(places: LeftoverPlace[]): LeftoverPlace[] {
  return places.filter((p) => p.kind !== 'freezer').sort(byName)
}

/** Freeze it defaults to the default Storage Place if it is a freezer, else the first freezer by name; null with none. */
export function defaultFreezer(places: LeftoverPlace[]): LeftoverPlace | null {
  const freezers = freezerPlaces(places)
  return freezers.find((p) => p.default) ?? freezers[0] ?? null
}

/** Use-by after Freeze it: today + the Recipe's Frozen Use-by, else the Household's. */
export function freezeUseBy(today: string, recipeDays: number | null, householdDays: number): { date: string; days: number } {
  const days = recipeDays ?? householdDays
  return { date: addDays(today, days), days }
}

/** Use-by after Take out: today + the Recipe's Use-by days. */
export function takeOutUseBy(today: string, useByDays: number): { date: string; days: number } {
  return { date: addDays(today, useByDays), days: useByDays }
}
