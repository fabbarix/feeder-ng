import type { ReactElement } from 'react'
import type { IngredientChoice } from '../types'

export interface AddLotSheetProps {
  open: boolean
  onClose: () => void
  choices: IngredientChoice[]
  onSubmit: (input: { ingredientId: number; quantity: number; purchased?: string }) => void
}

/**
 * BottomSheet "Add a Stock Lot" with: `IngredientSelect` labelled "Ingredient" (searchable, no onCreate; the first
 * Ingredient is the default until picked), `TextField` labelled "Quantity" (inputMode decimal, `suffix` = the chosen
 * Ingredient's Base Unit, parseAmount 'positive', error shown inline via the field's `error`), `DateField` labelled
 * "Bought on" (optional, max = today when known, empty = omit `purchased`), and a primary Save in the sheet `footer`.
 * No native select/date input, no `role="alert"` paragraph (the field error is the message).
 */
export function AddLotSheet(_props: AddLotSheetProps): ReactElement | null {
  throw new Error('not implemented')
}
