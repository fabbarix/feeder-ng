import type { ReactNode } from 'react'
import type { RecipeAction, RecipeStatus } from '../types'

export interface RecipeConflictTileProps {
  recipe: RecipeStatus
  onChoose: (action: RecipeAction) => void
}

/** importStrings.conflictTitle(name) and three Chips (Replace, Keep both, Skip) with aria-pressed from recipe.action; when keep_both is chosen shows importStrings.importedAs(recipe.importedAs). Nothing is pressed while unanswered. */
export function RecipeConflictTile(props: RecipeConflictTileProps): ReactNode {
  void props
  throw new Error('not implemented')
}
