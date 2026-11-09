import type { Product } from '../types'

export interface ProductListProps {
  products: Product[]
}

/** Tiles with the name and formatted pack size, each linking to /products/:id; EmptyState when none. */
export function ProductList(props: ProductListProps): never {
  void props
  throw new Error('TODO')
}
