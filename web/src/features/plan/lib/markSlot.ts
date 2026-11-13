// B5-F1: the plan address that opens one Meal Slot's Mark as Cooked / Mark all Cooked sheet (the Shopping List hint's "Mark it").
// It is /plan?mark=<date>:<mealSlotId>, a parameter of the Plan page (no new route). Plain TypeScript, no React.
import type { PlanSlot, SlotDayKey, SlotKey } from '../types'

/** What the sheet does for a slot. */
export type MarkSlotTarget =
  | { kind: 'one'; key: SlotKey }
  | { kind: 'all'; slot: SlotDayKey; courseIds: number[] }
  | { kind: 'none' }

/** The address: /plan?mark=2026-11-09:4. */
export function markSlotPath(_key: SlotDayKey): string {
  return ''
}

/** Reads the `mark` parameter back; null for anything that is not "<date>:<whole slot id>" (or no parameter). */
export function parseMarkSlotParam(_value: string | null): SlotDayKey | null {
  return null
}

/** One Course still to cook: the single Mark as Cooked sheet; several: Mark all Cooked; none (or no such slot): none. */
export function markSlotTarget(_slot: PlanSlot | undefined): MarkSlotTarget {
  return { kind: 'none' }
}
