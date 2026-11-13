// B5-F1: the plan address that opens one slot's Mark as Cooked / Mark all Cooked sheet (the Shopping List hint's "Mark it").
// It is /plan?mark=<date>:<mealSlotId>, a parameter of the Plan page (no new route). Plain TypeScript, no React.
import type { PlanSlot, SlotDayKey, SlotKey } from '../types'
import { unresolvedCourseIds } from './courses'

/** What the sheet does for a slot. */
export type MarkSlotTarget =
  | { kind: 'one'; key: SlotKey }
  | { kind: 'all'; slot: SlotDayKey; courseIds: number[] }
  | { kind: 'none' }

const MARK = /^(\d{4}-\d{2}-\d{2}):(\d+)$/

/** The address: /plan?mark=2026-11-09:4. */
export function markSlotPath(key: SlotDayKey): string {
  return `/plan?mark=${key.date}:${key.mealSlotId}`
}

/** Reads the `mark` parameter back; null for anything that is not "<date>:<whole slot id>" (or no parameter). */
export function parseMarkSlotParam(value: string | null): SlotDayKey | null {
  if (!value) return null
  const m = MARK.exec(value)
  if (!m) return null
  const date = m[1]!
  if (Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return null
  const [, month, day] = date.split('-').map(Number)
  if ((month ?? 0) < 1 || (month ?? 0) > 12 || (day ?? 0) < 1 || (day ?? 0) > 31) return null
  return { date, mealSlotId: Number(m[2]) }
}

/** One Course still to cook: the single Mark as Cooked sheet; several: Mark all Cooked; none (or no such slot): none. */
export function markSlotTarget(slot: PlanSlot | undefined): MarkSlotTarget {
  if (!slot) return { kind: 'none' }
  const ids = unresolvedCourseIds(slot)
  if (ids.length === 0) return { kind: 'none' }
  if (ids.length === 1) return { kind: 'one', key: { date: slot.date, mealSlotId: slot.mealSlotId, courseId: ids[0]! } }
  return { kind: 'all', slot: { date: slot.date, mealSlotId: slot.mealSlotId }, courseIds: ids }
}
