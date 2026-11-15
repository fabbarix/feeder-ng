// The Products the Add Shop Barcode sheet offers (SET-01), as the Product Select lists them. Plain TypeScript, no React.
// GET /api/products carries neither the kind nor the Shops: a Supply is read from its Ingredient's kind (absent when the Ingredients
// could not be read), "sold at" from the Products the Shop has a Price or a Shop Barcode for.
import type { ProductChoice } from '../../../ui'
import { formatPackSize } from '../../products/lib/names'
import type { Product } from '../types'

export function productChoices(
  products: Product[],
  ingredients: { id: number; kind?: string }[] | undefined,
  soldAtProductIds: number[],
  shopId: number,
): ProductChoice[] {
  const kinds = new Map((ingredients ?? []).map((i) => [i.id, i.kind]))
  const sold = new Set(soldAtProductIds)
  return products.map((p) => {
    const known = kinds.has(p.ingredientId)
    return {
      id: p.id,
      name: p.name,
      ingredientName: p.ingredientName,
      packLabel: formatPackSize(p.packSize, p.baseUnit),
      ...(known ? { supply: kinds.get(p.ingredientId) === 'supply' } : {}),
      ...(p.imageUrl ? { imageUrl: p.imageUrl } : {}),
      shopIds: sold.has(p.id) ? [shopId] : [],
    }
  })
}

/** The Products a Shop sells, for the "Sold at" group: those it has a Price or a Shop Barcode for. */
export function soldAtIds(prices: { productId: number }[], barcodes: { productId: number }[]): number[] {
  return [...new Set([...prices.map((p) => p.productId), ...barcodes.map((b) => b.productId)])]
}
