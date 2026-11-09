// Pure helpers for the Export picker.

/** Adds the id when absent, removes it when present. Returns a new array in ascending order. */
export function toggleId(selected: readonly number[], id: number): number[] {
  const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
  return next.sort((a, b) => a - b)
}

/** All ids, ascending. */
export function selectAllIds(ids: readonly number[]): number[] {
  return [...ids].sort((a, b) => a - b)
}

/** True when every id is selected (and there is at least one). */
export function allSelected(ids: readonly number[], selected: readonly number[]): boolean {
  return ids.length > 0 && ids.every((id) => selected.includes(id))
}

/** The download address: `/api/recipe-file/export?all=1` when every Recipe is selected, else `?ids=1,2,3` (ascending). Null when nothing is selected. */
export function exportHref(ids: readonly number[], selected: readonly number[]): string | null {
  if (selected.length === 0) return null
  if (allSelected(ids, selected)) return '/api/recipe-file/export?all=1'
  return `/api/recipe-file/export?ids=${[...selected].sort((a, b) => a - b).join(',')}`
}
