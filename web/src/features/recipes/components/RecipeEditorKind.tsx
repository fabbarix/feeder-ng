import type { ReactNode } from 'react'
import { Segmented } from '../../../ui/fields/Segmented'
import type { EditorKind } from '../lib/baseRecipe'
import { recipeStrings } from '../strings'

export interface RecipeEditorKindProps {
  value: EditorKind
  onChange: (kind: EditorKind) => void
}

/** RX-10 (decision RX 4): the Recipe's kind as one Segmented "Kind": Recipe, Ready Meal, Base recipe, with its one-line footnote. */
export function RecipeEditorKind({ value, onChange }: RecipeEditorKindProps): ReactNode {
  const f = recipeStrings.fields
  return (
    <div className="recipe-kind">
      <Segmented<EditorKind>
        size="md"
        label={f.kind}
        helper={f.kindHelp}
        value={value}
        onChange={onChange}
        options={[
          { value: 'recipe', label: f.kindRecipe },
          { value: 'readyMeal', label: f.readyMeal },
          { value: 'base', label: recipeStrings.baseRecipe.badge },
        ]}
      />
    </div>
  )
}
