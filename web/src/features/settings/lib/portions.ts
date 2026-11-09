import type { AttendanceEntry, Member } from '../types'

export const MIN_PORTION_FACTOR = 0.25
export const MAX_PORTION_FACTOR = 3
export const PORTION_STEP = 0.25

type FactorMember = Pick<Member, 'id' | 'portionFactor'>

/** 0.25..3 in 0.25 steps. */
export function isValidPortionFactor(n: number): boolean {
  if (!Number.isFinite(n) || n < MIN_PORTION_FACTOR || n > MAX_PORTION_FACTOR) return false
  const steps = n / PORTION_STEP
  return Math.abs(steps - Math.round(steps)) < 1e-9
}

/** The override when set, else the Member's default. */
export function effectiveFactor(member: FactorMember, entry: AttendanceEntry): number {
  return entry.portionFactorOverride ?? member.portionFactor
}

/** Sum of the effective factors of the attending Members; entries for unknown Members count 0. */
export function portionsNeeded(members: FactorMember[], attendance: AttendanceEntry[]): number {
  let total = 0
  for (const entry of attendance) {
    const member = members.find((m) => m.id === entry.memberId)
    if (member) total += effectiveFactor(member, entry)
  }
  return total
}

/** "1 portion", "2.5 portions", "0 portions". */
export function formatPortions(n: number): string {
  return `${n} ${n === 1 ? 'portion' : 'portions'}`
}

/** The entry with a new effective factor: an override, or null when it equals the Member's default. */
export function withFactor(member: FactorMember, entry: AttendanceEntry, factor: number): AttendanceEntry {
  return { ...entry, portionFactorOverride: factor === member.portionFactor ? null : factor }
}

/** The bare number for a status line: "2.5", "1", "0". */
export function formatPortionsNeeded(n: number): string {
  return String(Math.round(n * 100) / 100)
}
