import type { ReactNode } from 'react'
import type { BaseUnit, IngredientMatch } from '../types'

export interface IngredientMatchTileProps {
  match: IngredientMatch
  onUseExisting: (ingredientId: number) => void
  onCreate: (opts?: { name?: string; baseUnit?: BaseUnit }) => void
}

/**
 * One Ingredient of the file. Shows its name and a Chip with the status label (importStrings.status*).
 * - exact: "Matches <existing name>" and no actions needed (but "Create new" stays available).
 * - suggested: one button per suggestion (importStrings.useExisting(name)) and "Create new" (pressed by default via match.effective).
 * - new: states it will be created from its definition; "Create new" pressed.
 * - undefined: Base Unit Chips g / ml / piece (choosing one calls onCreate({baseUnit})) plus any suggestions.
 * - conflict: importStrings.conflictText(file, existing); buttons "Use <existing name>" (onUseExisting(match.id)) and a text field
 *   (importStrings.newNameLabel) + "Create under this name" (onCreate({name}), disabled while blank).
 */
export function IngredientMatchTile(props: IngredientMatchTileProps): ReactNode {
  void props
  throw new Error('not implemented')
}
