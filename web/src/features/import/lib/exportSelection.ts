// Pure helpers for the Export picker.
import { normalizeName } from '../../ingredients/lib/names'

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

/** B9-28 (RX-15): the "All Recipes" Checkbox: none, some (mixed) or all of the ids selected. Ids not in the list are ignored. */
export function selectionState(ids: readonly number[], selected: readonly number[]): 'none' | 'some' | 'all' {
  const chosen = ids.filter((id) => selected.includes(id)).length
  if (chosen === 0) return 'none'
  return chosen === ids.length ? 'all' : 'some'
}

/** B9-28 (RX-15): the search field shows from this many Recipes on (more than 12). */
export const EXPORT_SEARCH_FROM = 13

/** The Recipes whose name holds the search (case and spacing ignored), in their order; all of them for a blank search. */
export function searchRecipes<T extends { name: string }>(recipes: readonly T[], query: string): T[] {
  const key = normalizeName(query)
  if (key === '') return [...recipes]
  return recipes.filter((r) => normalizeName(r.name).includes(key))
}
