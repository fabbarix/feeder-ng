import type { NewIngredient } from '../types'

export interface NewIngredientSheetProps {
  open: boolean
  onClose: () => void
  /** Rejects with ApiError; code 'name_taken' shows strings.nameTaken, 'invalid_ingredient' shows the server message. */
  onCreate: (body: NewIngredient) => Promise<unknown>
}

/** BottomSheet "New Ingredient": Name field, Base Unit chips (g, ml, piece; none preselected), Create Ingredient (disabled until a name and Base Unit are set). Closes on success. */
export function NewIngredientSheet(props: NewIngredientSheetProps) {
  void props
  return null
}
