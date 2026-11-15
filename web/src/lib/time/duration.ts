/** A unit a Lead time or Duration can be shown in. The draft and the API always keep whole minutes. */
export type DurationUnit = 'min' | 'h' | 'd'

/** Minutes in one of each unit. */
export const UNIT_MINUTES: Readonly<Record<DurationUnit, number>> = { min: 1, h: 60, d: 1440 }

const DEFAULT_UNITS: readonly DurationUnit[] = ['min', 'h', 'd']

/**
 * The largest of `units` that divides `minutes` evenly, and the amount in it: 360 is 6 h, 90 stays 90 min, 1440 is 1 d (24 h when
 * the field offers no days). A negative or non-finite amount is 0 min.
 */
export function splitMinutes(minutes: number, units: readonly DurationUnit[] = DEFAULT_UNITS): { value: number; unit: DurationUnit } {
  const whole = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0
  if (whole === 0) return { value: 0, unit: 'min' }
  const largestFirst = [...units].sort((a, b) => UNIT_MINUTES[b] - UNIT_MINUTES[a])
  for (const unit of largestFirst) {
    if (whole % UNIT_MINUTES[unit] === 0) return { value: whole / UNIT_MINUTES[unit], unit }
  }
  return { value: whole, unit: 'min' }
}

/** An amount in `unit` as whole minutes, never below 0. */
export function toMinutes(value: number, unit: DurationUnit): number {
  return Math.max(0, Math.round(value * UNIT_MINUTES[unit]))
}

/** Whole minutes shown in `unit`, to at most 2 decimals (the number a unit change shows). */
export function fromMinutes(minutes: number, unit: DurationUnit): number {
  return Math.round((minutes / UNIT_MINUTES[unit]) * 100) / 100
}
