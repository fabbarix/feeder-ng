import type { ReactElement } from 'react'
import type { IngredientChoice } from '../types'

export interface AddLotSheetProps {
  open: boolean
  onClose: () => void
  choices: IngredientChoice[]
  onSubmit: (input: { ingredientId: number; quantity: number; purchased?: string }) => void
}

/**
 * BottomSheet "Add a Stock Lot": a select labelled "Ingredient", an input labelled
 * "Quantity" (parseAmount 'positive'; the unit is shown from the chosen Ingredient's
 * Base Unit), an optional date "Bought on", and Save. Invalid entry shows the error and does not submit.
 */
export function AddLotSheet(props: AddLotSheetProps): ReactElement | null {
  void props
  throw new Error('TODO')
}
