// R8: a Product that owns a barcode but is Archived. Plain TypeScript. WP7 stub.
import type { ScanResult } from '../types'

/** The Product JSON the server sends in resolve's `archivedProduct` and from GET /api/products/{id}. */
export interface ArchivedProduct {
  id: number
  name: string
  ingredientId: number
  ingredientName: string
  baseUnit: 'g' | 'ml' | 'piece'
  packSize: number
  archived: boolean
}

/**
 * The owner's id when `result` is a rejected shop_unknown with error code `barcode_archived`; its message is
 * "barcode already belongs to product 9". null for any other result.
 */
export function archivedOwnerId(result: ScanResult | null): number | null {
  void result
  return null
}
