import type { ReactNode } from 'react'
import { TextField } from '../../../ui'
import { codeMessage, recipeStrings } from '../strings'
import { kindOf, type EditorKind } from '../lib/baseRecipe'
import type { DraftErrors, RecipeDraft } from '../lib/draft'
import { PhotoPicker } from './PhotoPicker'
import { RecipeEditorKind } from './RecipeEditorKind'

export interface RecipeBasicsFieldsProps {
  draft: RecipeDraft
  errors: DraftErrors
  onName: (name: string) => void
  onImage: (image: string) => void
  onKind: (kind: EditorKind) => void
  /** A new Recipe: the Name takes the cursor on open. */
  autoFocusName?: boolean
  /** PE: the photo picker started or stopped uploading. */
  onPhotoBusyChange?: (busy: boolean) => void
}

/** RX-02 "Recipe" section: the Name, the 96 px Photo button beside it, and the Kind (RX-10). Field primitives only. */
export function RecipeBasicsFields({ draft, errors, onName, onImage, onKind, autoFocusName, onPhotoBusyChange }: RecipeBasicsFieldsProps): ReactNode {
  return (
    <div className="recipe-basics">
      <div className="recipe-basics__name-row">
        <div className="recipe-basics__name">
          <TextField
            size="full"
            label={recipeStrings.fields.name}
            value={draft.name}
            error={errors.name ? codeMessage(errors.name) : undefined}
            onChange={onName}
            autoFocus={autoFocusName}
          />
        </div>
        <PhotoPicker value={draft.image} onChange={onImage} onBusyChange={onPhotoBusyChange} />
      </div>
      <RecipeEditorKind value={kindOf(draft)} onChange={onKind} />
    </div>
  )
}
