import type { ReactNode } from 'react'
import type { PhotoChoice, PhotoRecipeOption } from '../lib/photoChoice'
import type { ReviewPhoto } from '../types'

export interface ReviewPhotoChoiceProps {
  importId: string
  photos: ReviewPhoto[]
  recipes: PhotoRecipeOption[]
  choice: PhotoChoice
  onToggle: (on: boolean) => void
  onPhoto: (index: number) => void
  onRecipe: (index: number) => void
}

/** The "Photo for the Recipe" tile of Import Review. Renders nothing without candidate photos. TODO(ra-e developer). */
export function ReviewPhotoChoice(props: ReviewPhotoChoiceProps): ReactNode {
  void props
  return null
}
