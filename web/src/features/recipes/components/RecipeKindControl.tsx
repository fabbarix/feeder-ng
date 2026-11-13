import type { ReactNode } from 'react'
import { Segmented } from '../../../ui/fields/Segmented'
import { recipeStrings } from '../strings'
import type { RecipeKind } from '../types'

export interface RecipeKindControlProps {
  value: Exclude<RecipeKind, 'all'>
  onChange: (kind: Exclude<RecipeKind, 'all'>) => void
}

/** BR-D: the segmented control "Recipes · Base recipes" of the Recipes list (shared Segmented, a radiogroup labelled "Kind"). */
export function RecipeKindControl({ value, onChange }: RecipeKindControlProps): ReactNode {
  const t = recipeStrings.baseRecipe.kind
  return (
    <Segmented
      label={t.label}
      value={value}
      onChange={onChange}
      options={[
        { value: 'plannable', label: t.recipes },
        { value: 'base', label: t.bases },
      ]}
    />
  )
}
