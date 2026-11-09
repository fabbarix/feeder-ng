// Pure helpers for the Export picker.

/** Adds the id when absent, removes it when present. Returns a new array in ascending order. */
export function toggleId(selected: readonly number[], id: number): number[] {
  void selected; void id
  throw new Error('not implemented')
}

/** All ids, ascending. */
export function selectAllIds(ids: readonly number[]): number[] {
  void ids
  throw new Error('not implemented')
}

/** True when every id is selected (and there is at least one). */
export function allSelected(ids: readonly number[], selected: readonly number[]): boolean {
  void ids; void selected
  throw new Error('not implemented')
}

/** The download address: `/api/recipe-file/export?all=1` when every Recipe is selected, else `?ids=1,2,3` (ascending). Null when nothing is selected. */
export function exportHref(ids: readonly number[], selected: readonly number[]): string | null {
  void ids; void selected
  throw new Error('not implemented')
}
