// Pure defaults and rules for the Leftover sheets (no React).
import { addDays } from './dates'
import type { LeftoverPlace } from './types'

/** B9-45 (PC-13): portions move in quarters, so a 1.25-portion Leftover is never stranded. */
export const PORTION_STEP = 0.25

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

/** The stepper: quarter steps, a quarter up to what is left (stepPortions reaches the maximum). */
export function portionBounds(left: number): StepperBounds {
  return { min: PORTION_STEP, max: left, step: PORTION_STEP }
}

/** Two decimals at most: no floating point dust (0.75 + 0.25 is 1). */
const tidy = (n: number) => Math.round(n * 100) / 100
/** A tolerance for quarters computed from sums of decimals (1.3 - 0.05 is not exactly 1.25). */
const EPS = 1e-9

/** Freeze it: default every portion no Planned Meal is planned to use, rounded down to a quarter; all of them when less than a quarter is spare. */
export function freezeDefaultPortions(left: number, plannedPortions: number): number {
  const spare = left - plannedPortions
  if (spare < PORTION_STEP - EPS) return left
  return tidy(Math.floor(spare / PORTION_STEP + EPS) * PORTION_STEP)
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

// ---- B9-45 (PC-13): the portion steppers' move (Had it, Threw it out, Freeze it). ----

/** The stepper's move: one step up (1) or down (-1) in steps of 0.25, from `value`, never below 0.25 and never above `left`; the maximum is always reachable (1 up from 1 in a 1.25 Leftover is 1.25; 1 down from 1.3 is 1.25). */
export function stepPortions(value: number, direction: 1 | -1, left: number): number {
  const min = Math.min(PORTION_STEP, left)
  const next =
    direction === 1
      ? Math.floor(value / PORTION_STEP + EPS) * PORTION_STEP + PORTION_STEP
      : Math.ceil(value / PORTION_STEP - EPS) * PORTION_STEP - PORTION_STEP
  return tidy(Math.min(left, Math.max(min, next)))
}

/**
 * What a portion stepper's control asked for (`next`, the shared Stepper's one step, Home or End) as a quarter move from `value`: the
 * ends stay the ends, a step up or down lands on the next quarter (lib stepPortions), so 1.3 - 0.25 reads 1.25, never 1.05.
 */
export function snapPortions(value: number, next: number, left: number): number {
  const min = Math.min(PORTION_STEP, left)
  if (next >= left) return left
  if (next <= min) return min
  if (next === value) return value
  return stepPortions(value, next > value ? 1 : -1, left)
}
