// B9-32 (PC-07): "Mark Recipes as Dessert" without leaving the Plan. STUB (test author): the developer builds it, with hooks/useMarkCourseRecipes.
import type { ReactNode } from 'react'

export interface MarkCourseRecipesSheetProps {
  open: boolean
  onClose: () => void
  /** The Course to mark Recipes with. */
  course: { id: number; name: string }
  /** How many meals could not be planned for it: the context line "Couldn't plan 7 Desserts". */
  count: number
}

export function MarkCourseRecipesSheet(_props: MarkCourseRecipesSheetProps): ReactNode {
  return null
}
