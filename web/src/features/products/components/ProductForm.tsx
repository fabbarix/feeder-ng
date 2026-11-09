import type { BaseUnit, NewProduct } from '../types'

export interface ProductFormProps {
  ingredientId: number
  ingredientName: string
  baseUnit: BaseUnit
  /** Called with the validated body; a rejection's message is shown in an alert. */
  onSubmit: (body: NewProduct) => Promise<void>
}

/**
 * Name, pack size (in the Base Unit) and optional barcode. While the name field has
 * not been edited by hand it follows `defaultProductName(ingredientName, packSize, baseUnit)`
 * once a valid pack size is typed. Validation via lib/productForm; shows errors under the fields.
 */
export function ProductForm(props: ProductFormProps): never {
  void props
  throw new Error('TODO')
}
