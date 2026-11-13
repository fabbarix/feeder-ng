import { IngredientsScreen } from './IngredientsScreen'

/** Route /supplies (decision D5): the Ingredients list of kind "supply", with its own words. */
export function SuppliesScreen() {
  return <IngredientsScreen kind="supply" />
}
