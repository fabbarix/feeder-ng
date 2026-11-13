import type { ReactNode } from 'react'

export interface LinkCandidatesSheetProps {
  open: boolean
  baseRecipe: { id: number; name: string; baseUnit: string; ingredientId: number }
  onClose: () => void
}

/**
 * BR-D (design §3.8): "N Recipes use an Ingredient named X. Link them to this Base recipe?" with a crafted Checkbox per line ("Lasagne · 500 ml béchamel"), nothing ticked,
 * disabled rows with their reasons, "Link N" and "Not now"; then the merge offer step ("Merge" / "Keep it"). Never silent: with no candidates it shows nothing and closes.
 */
export function LinkCandidatesSheet(props: LinkCandidatesSheetProps): ReactNode {
  void props
  return null
}
