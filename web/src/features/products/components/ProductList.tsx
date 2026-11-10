import { Link } from 'react-router-dom'
import { EmptyState, Tile } from '../../../ui'
import { formatPackSize } from '../lib/names'
import { strings } from '../strings'
import type { Product } from '../types'
import '../products.css'

export interface ProductListProps {
  products: Product[]
  /** Display unit system; defaults to metric. Callers pass useDisplayUnitSystem(). */
  system?: 'metric' | 'imperial'
  /** WP11: the Archived filter is on and the list is empty -> "No archived Products". */
  showingArchived?: boolean
}

/** Tiles with the name and formatted pack size, each linking to /products/:id; EmptyState when none. */
export function ProductList({ products, system = 'metric' }: ProductListProps) {
  if (products.length === 0) {
    return <EmptyState title={strings.productsEmpty} description={strings.productsEmptyHint} />
  }
  return (
    <ul className="pg__list">
      {products.map((p) => (
        <li key={p.id}>
          <Tile size="wide">
            <div className="pg__row pg__row--between">
              <Link to={`/products/${p.id}`}>{p.name}</Link>
              <span>{formatPackSize(p.packSize, p.baseUnit, system)}</span>
            </div>
          </Tile>
        </li>
      ))}
    </ul>
  )
}
