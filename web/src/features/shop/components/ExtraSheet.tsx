import type { ExtraInput } from '../types'

export interface ExtraSheetProps {
  open: boolean
  onClose: () => void
  /** the Ingredients to pick from for an Ingredient extra */
  ingredients: { id: number; name: string }[]
  onSubmit: (input: ExtraInput) => void
}

/**
 * "Add an extra" (functional spec §9): a BottomSheet titled "Add an extra" with a field "Something to buy" for free
 * text, or an Ingredient choice ("Ingredient", a select of `ingredients`) with a "Quantity" (Base Units). "Save"
 * submits { text } when only the text is filled, { ingredientId, quantity } when an Ingredient and a quantity > 0 are
 * chosen; nothing filled, both filled, or an Ingredient without a quantity > 0 shows "Required" / "Enter a number
 * above 0" and does not submit. Stub until implemented.
 */
export function ExtraSheet(props: ExtraSheetProps) {
  void props
  return null
}
