// Product archive rules (docs/dev/design/r8-product-archive.md, GLOSSARY "Archived"). Plain TypeScript, no React.
import { ApiError } from '../../../lib/http'
import type { Product } from '../types'

export type DeleteOutcome = 'bought' | 'other'

/** What a failed `DELETE /api/products/{id}` means: 409 `product_bought` -> 'bought' (offer Archive); anything else -> 'other'. */
export function deleteOutcome(err: unknown): DeleteOutcome {
  return err instanceof ApiError && err.status === 409 && err.code === 'product_bought' ? 'bought' : 'other'
}

/** The Products list for the "Archived" filter chip: on -> only archived Products; off -> only active ones. Order is kept. */
export function applyArchivedFilter<P extends Pick<Product, 'archived'>>(products: P[], showArchived: boolean): P[] {
  return products.filter((p) => Boolean(p.archived) === showArchived)
}

/** Which actions the Product page offers: 'archive' while active, 'unarchive' once archived; 'delete' is always offered (the server decides). */
export function productActions(product: Pick<Product, 'archived'>): Array<'archive' | 'unarchive' | 'delete'> {
  return product.archived ? ['unarchive', 'delete'] : ['archive', 'delete']
}
