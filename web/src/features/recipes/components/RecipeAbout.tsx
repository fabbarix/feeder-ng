import type { ReactNode } from 'react'
import type { RecipeSource } from '../types'

export interface RecipeAboutProps {
  description: string
  source: RecipeSource
}

/** STUB (B9-27 test author, RX-05): the lede of Recipe detail. The developer implements it. */
export function RecipeAbout(_props: RecipeAboutProps): ReactNode {
  return null
}
