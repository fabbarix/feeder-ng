// B9-39 (TB-01, A11Y-08, B9-26 ruling 9): what one To confirm row shows and how its buttons are named, and where focus goes after a
// row leaves. Plain TypeScript, no React.
import { planStrings as s } from '../strings'
import type { PlanEntry } from '../types'
import { dayLabel } from './actionNames'
import { toConfirmMeta, type ToConfirmMeta, type ToConfirmRow } from './toConfirm'

export interface ToConfirmRowView {
  /** The badge's top line: "Today" for a slot of today (TB-01: it has just joined), else the short weekday. */
  dayLabel: string
  /** A slot of today: the badge is in the info tone. */
  fresh: boolean
  /** The group's name and its ⋮'s: "Today Lunch", "Mon Lunch". */
  groupLabel: string
  meta: ToConfirmMeta | null
  /** The primary's text ("Cooked", "All Cooked") and the accessible names "Cooked Lentil soup, Mon 9 Lunch", "Adjust Lentil soup, Mon 9 Lunch". */
  primaryLabel: string
  primaryName: string
  secondaryName: string
}

/** The row's view. `today` (the household date) marks today's rows; the meta of a today row ends with its slot time ("Main · 2 portions · 13:00"). */
export function toConfirmRowView(row: ToConfirmRow, entries: PlanEntry[], today?: string): ToConfirmRowView {
  const fresh = today !== undefined && row.slot.date === today
  const day = fresh ? s.today : row.dayLabel
  const when = `${dayLabel(row.slot.date)} ${row.slotName}`
  const primaryLabel = row.primary === 'cooked' ? s.cooked : s.allCookedShort
  const base = toConfirmMeta(row)
  const time = entries.find((e) => e.date === row.slot.date && e.mealSlotId === row.slot.mealSlotId)?.time
  const meta = fresh && time ? (base ? { ...base, text: `${base.text} · ${time}` } : { emphasis: null, text: time }) : base
  return {
    dayLabel: day,
    fresh,
    groupLabel: `${day} ${row.slotName}`,
    meta,
    primaryLabel,
    primaryName: s.toConfirmAction(primaryLabel, row.main, when),
    secondaryName: s.toConfirmAction(s.adjust, row.main, when),
  }
}

/** The key of a To confirm row ("2026-11-09/2"). */
export function toConfirmRowKey(row: Pick<ToConfirmRow, 'slot'>): string {
  return `${row.slot.date}/${row.slot.mealSlotId}`
}

/**
 * After the row `gone` left the list (Cooked, Not cooked), the row that takes focus: the one that took its place, else the one
 * before it; null when no row is left or `gone` was not a row.
 */
export function focusAfterRemoval(before: string[], after: string[], gone: string): string | null {
  const at = before.indexOf(gone)
  if (at < 0 || after.includes(gone)) return null
  const left = new Set(after)
  const next = before.slice(at + 1).find((k) => left.has(k))
  if (next !== undefined) return next
  const previous = [...before.slice(0, at)].reverse().find((k) => left.has(k))
  return previous ?? null
}
