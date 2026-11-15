import type { ReactNode } from 'react'
import type { RecipeAction, RecipeStatus } from '../types'

export interface RecipePreviewListProps {
  recipes: RecipeStatus[]
  onChoose: (index: number, action: RecipeAction) => void
}

/** B9-28 (RX-01): stub, not built yet. See RecipePreviewList.test.tsx. */
export function RecipePreviewList(_props: RecipePreviewListProps): ReactNode {
  return null
}
