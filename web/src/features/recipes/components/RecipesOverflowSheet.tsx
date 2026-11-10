import type { ReactNode } from 'react'
import { BottomSheet, Switch } from '../../../ui'
import { RecipeFileActions } from '../../import/components/RecipeFileActions'
import { recipeStrings } from '../strings'

export interface RecipesOverflowSheetProps {
  open: boolean
  onClose: () => void
  showArchived: boolean
  onShowArchivedChange: (on: boolean) => void
}

/**
 * The overflow of the Recipes header (ui-fix-plan 2.8, 5.8): a BottomSheet "More" holding the Recipe File actions
 * (import feature's RecipeFileActions: Import, Export, Copy Agent Prompt) and a "Show archived" Switch.
 */
export function RecipesOverflowSheet({ open, onClose, showArchived, onShowArchivedChange }: RecipesOverflowSheetProps): ReactNode {
  return (
    <BottomSheet open={open} onClose={onClose} title={recipeStrings.overflow.title}>
      <RecipeFileActions />
      <div className="recipes-overflow__archive">
        <Switch label={recipeStrings.overflow.showArchived} checked={showArchived} onChange={onShowArchivedChange} />
      </div>
    </BottomSheet>
  )
}
