// B9-32 (PC-01 hand-back, A11Y-07): every Course row has a stable focus target so a screen can put focus back on it.
// Plain TypeScript over the DOM, no React.
import type { SlotKey } from '../types'

/** The `data-row-key` of a Course row: "2026-11-17/1/1" (date / Meal Slot id / Course id). */
export function rowKey(key: SlotKey): string {
  return `${key.date}/${key.mealSlotId}/${key.courseId}`
}

/**
 * Moves focus to the row's target button (`[data-row-key] .list-row__target`); an unfilled row, which has no target,
 * focuses its first button (Choose a Recipe). Returns whether a row was found.
 */
export function focusPlanRow(key: SlotKey): boolean {
  if (typeof document === 'undefined') return false
  const row = document.querySelector<HTMLElement>(`[data-row-key="${rowKey(key)}"]`)
  if (!row) return false
  const target = row.querySelector<HTMLElement>('.list-row__target') ?? row.querySelector<HTMLElement>('button, a[href]')
  if (!target) return false
  target.focus()
  return true
}
