import type { ReactNode } from 'react'

export interface RecipesOverflowSheetProps {
  open: boolean
  onClose: () => void
  showArchived: boolean
  onShowArchivedChange: (on: boolean) => void
}

/**
 * The overflow of the Recipes header (ui-fix-plan 2.8, 5.8): a ui/BottomSheet "More" holding the Recipe File actions
 * (import feature's RecipeFileActions: Import, Export, Copy Agent Prompt) and a "Show archived" ui/Switch row.
 */
export function RecipesOverflowSheet(props: RecipesOverflowSheetProps): ReactNode {
  void props
  return null
}
