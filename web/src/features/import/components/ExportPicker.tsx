import type { ReactNode } from 'react'
import type { ExportableRecipe } from '../types'

export interface ExportPickerProps {
  recipes: ExportableRecipe[]
  selected: number[]
  onToggle: (id: number) => void
  onSelectAll: () => void
  onClear: () => void
  /** Download address or null. */
  href: string | null
}

/** One selectable Chip per Recipe (aria-pressed), "Select all" and "Clear", and the download link labelled importStrings.exportSelected(n) (importStrings.exportAll when every Recipe is selected); the link is absent while nothing is selected. importStrings.noRecipes when the list is empty. */
export function ExportPicker(props: ExportPickerProps): ReactNode {
  void props
  throw new Error('not implemented')
}
