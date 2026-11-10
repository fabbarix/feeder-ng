// Product archive rules (docs/dev/design/r8-product-archive.md, GLOSSARY "Archived"). Plain TypeScript, no React.
import type { Product } from '../types'

export type DeleteOutcome = 'bought' | 'other'

/** What a failed `DELETE /api/products/{id}` means: 409 `product_bought` -> 'bought' (offer Archive); anything else -> 'other'. */
export function deleteOutcome(err: unknown): DeleteOutcome {
  void err
  throw new Error('not implemented: WP11 deleteOutcome')
}

/** The Products list for the "Archived" filter chip: on -> only archived Products; off -> only active ones. Order is kept. */
export function applyArchivedFilter<P extends Pick<Product, 'archived'>>(products: P[], showArchived: boolean): P[] {
  void products
  void showArchived
  throw new Error('not implemented: WP11 applyArchivedFilter')
}

/** Which actions the Product page offers: 'archive' while active, 'unarchive' once archived; 'delete' is always offered (the server decides). */
export function productActions(product: Pick<Product, 'archived'>): Array<'archive' | 'unarchive' | 'delete'> {
  void product
  throw new Error('not implemented: WP11 productActions')
}
