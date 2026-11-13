import type { ReactNode } from 'react'
import type { RecipeKind } from '../types'

export interface RecipeKindControlProps {
  value: Exclude<RecipeKind, 'all'>
  onChange: (kind: Exclude<RecipeKind, 'all'>) => void
}

/** BR-D: the segmented control "Recipes · Base recipes" of the Recipes list (shared Segmented, a radiogroup labelled "Kind"). */
export function RecipeKindControl(props: RecipeKindControlProps): ReactNode {
  void props
  return null
}
