import type { BaseUnit } from '../types'

export interface IngredientProductsProps {
  ingredientId: number
  ingredientName: string
  baseUnit: BaseUnit
}

/**
 * The "Products" tile of an Ingredient page (embedded by the ingredients feature):
 * lists the Ingredient's Products (name, pack size, link to /products/:id) with an
 * EmptyState when there are none, and a "New Product" button opening a BottomSheet
 * with ProductForm. A successful create closes the sheet.
 */
export function IngredientProducts(props: IngredientProductsProps): never {
  void props
  throw new Error('TODO')
}
