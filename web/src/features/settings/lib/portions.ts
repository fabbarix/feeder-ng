import type { AttendanceEntry, Member } from '../types'

export const MIN_PORTION_FACTOR = 0.25
export const MAX_PORTION_FACTOR = 3
export const PORTION_STEP = 0.25

type FactorMember = Pick<Member, 'id' | 'portionFactor'>

/** 0.25..3 in 0.25 steps. */
export function isValidPortionFactor(_n: number): boolean {
  throw new Error('not implemented')
}

/** The override when set, else the Member's default. */
export function effectiveFactor(_member: FactorMember, _entry: AttendanceEntry): number {
  throw new Error('not implemented')
}

/** Sum of the effective factors of the attending Members; entries for unknown Members count 0. */
export function portionsNeeded(_members: FactorMember[], _attendance: AttendanceEntry[]): number {
  throw new Error('not implemented')
}

/** "1 portion", "2.5 portions", "0 portions". */
export function formatPortions(_n: number): string {
  throw new Error('not implemented')
}

/** The entry with a new effective factor: an override, or null when it equals the Member's default. */
export function withFactor(_member: FactorMember, _entry: AttendanceEntry, _factor: number): AttendanceEntry {
  throw new Error('not implemented')
}
