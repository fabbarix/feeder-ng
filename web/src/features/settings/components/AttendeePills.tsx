import type { MealSlot, Member } from '../types'

export interface AttendeePillsProps {
  slot: MealSlot
  members: Member[]
  /** Pills before "+N" (default 4). */
  max?: number
  /** The "Nobody attending" pill is a button; it calls this (Admin: the slot sheet; a plain User: the one-date Attendance). */
  onFix?: (slot: MealSlot) => void
}

/** STUB (R15 step 2): Member pills, "+N", or the "Nobody attending" warning pill. */
export function AttendeePills(_props: AttendeePillsProps) {
  return null
}
