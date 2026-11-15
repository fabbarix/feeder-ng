// B9-32 (PC-01 hand-back, A11Y-07): every Course row has a stable focus target so a screen can put focus back on it. STUB (test author).
import type { SlotKey } from '../types'

/** The `data-row-key` of a Course row: "2026-11-17/1/1" (date / Meal Slot id / Course id). */
export function rowKey(_key: SlotKey): string {
  throw new Error('B9-32: rowKey is not built yet')
}

/** Moves focus to the row's target button (`[data-row-key] .list-row__target`). Returns whether a row was found. */
export function focusPlanRow(_key: SlotKey): boolean {
  throw new Error('B9-32: focusPlanRow is not built yet')
}
