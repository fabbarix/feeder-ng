import { IngredientScreen } from './IngredientScreen'

/** Route /supplies/:id (decision D5): the Ingredient page of kind "supply". */
export function SupplyScreen() {
  return <IngredientScreen kind="supply" />
}
