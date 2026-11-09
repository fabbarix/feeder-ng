import type { ExportableRecipe } from '../types'

export interface UseExportPicker {
  recipes: ExportableRecipe[]
  isLoading: boolean
  error: Error | null
  selected: number[]
  toggle: (id: number) => void
  selectAll: () => void
  clear: () => void
  /** Download address (lib/exportSelection.exportHref) or null when nothing is selected. */
  href: string | null
}

/** Recipes (query key ['recipes', 'export']) and the selection state for the Export picker. */
export function useExportPicker(): UseExportPicker {
  throw new Error('not implemented')
}
