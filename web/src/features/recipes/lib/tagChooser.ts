import type { TagCount } from '../types'

// B9-37 stub (RX-09; pinned by lib/tagChooser.test.ts): what the Tag chooser lists and whether it offers "Add Tag".

export interface ChooserRow {
  name: string
  /** How many Recipes carry the Tag (0 for a new one). */
  recipes: number
  chosen: boolean
}

export function chooserRows(_known: readonly TagCount[], _chosen: readonly string[], _query: string): { rows: ChooserRow[]; create: string | null } {
  throw new Error('B9-37: chooserRows is not built yet')
}
