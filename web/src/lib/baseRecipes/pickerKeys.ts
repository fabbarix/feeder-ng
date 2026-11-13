import type { PickerRow, PickerRows } from './types'

// BR-D (design §3.7): the picker's rows in the order the keys walk them (Base recipes, the create row, the plannable Recipes) and the active move
// over them: disabled rows are skipped, the ends do not wrap. Pure.

/** Every row of the picker, in display order. */
export function flatPickerRows(rows: PickerRows): PickerRow[] {
  return [...rows.base, ...(rows.create ? [rows.create] : []), ...rows.plannable]
}

const enabled = (row: PickerRow | undefined): boolean => row !== undefined && !(row.kind !== 'new' && row.disabled)

/** The active index after an arrow (`delta` 1 or -1): the next enabled row in that direction, staying put at the ends; from none, the first (or last) enabled. -1 when nothing is enabled. */
export function moveActive(rows: PickerRow[], active: number, delta: 1 | -1): number {
  const enabledIdx = rows.flatMap((r, i) => (enabled(r) ? [i] : []))
  if (enabledIdx.length === 0) return -1
  if (active < 0) return delta === 1 ? enabledIdx[0]! : enabledIdx[enabledIdx.length - 1]!
  if (delta === 1) return enabledIdx.find((i) => i > active) ?? active
  const before = enabledIdx.filter((i) => i < active)
  return before.length > 0 ? before[before.length - 1]! : active
}
