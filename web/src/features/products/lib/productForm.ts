// Product form rules. Plain TypeScript, no React; messages come from strings.ts.
import type { NewProduct } from '../types'

/** What the inputs hold (all text). */
export interface ProductFormValues {
  name: string
  packSize: string
  /** optional global barcode as typed or scanned */
  barcode: string
}

export type ProductFormErrors = Partial<Record<keyof ProductFormValues, string>>

/**
 * name: 1-100 characters after trimming; packSize: a number > 0 (decimal point or
 * comma); barcode: empty or readable (scan/lib/barcode `canonical` is not null).
 * Returns {} when everything is fine.
 */
export function validateProductForm(v: ProductFormValues): ProductFormErrors {
  void v
  throw new Error('TODO')
}

/** Trims and collapses the name, parses the pack size, wraps a non-empty barcode in `barcodes`. */
export function toNewProduct(v: ProductFormValues, ingredientId: number): NewProduct {
  void v; void ingredientId
  throw new Error('TODO')
}
