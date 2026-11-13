import type { ReactNode } from 'react'
import type { LinkChoice } from '../../../lib/baseRecipes/useLineLink'

export interface BaseRecipePickerProps {
  open: boolean
  /** The line's Ingredient name ("béchamel"): ranks the rows and names the "new Base recipe" row. */
  lineName: string
  /** The Recipe being edited (left out; the Recipes that call for it are listed disabled). Undefined for an unsaved Recipe. */
  recipeId?: number
  onClose: () => void
  onChoose: (choice: LinkChoice) => void
}

/**
 * BR-D (design §3.7): a crafted sheet (BottomSheet/Dialog) titled "Link to a Base recipe": a search field, the Base recipes (name matches first, the exact match marked), then
 * "Add "Béchamel" as a new Base recipe", then the group "Recipes you plan" (choosing one calls onChoose with kind 'convert'; the hook asks the confirm). Disabled rows say why. A listbox of options; no native control.
 */
export function BaseRecipePicker(props: BaseRecipePickerProps): ReactNode {
  void props
  return null
}
