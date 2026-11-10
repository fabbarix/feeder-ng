import { ListGroup, ListRow, Chip, EmptyState } from '../../../ui'
import { formatPackSize } from '../lib/names'
import { strings } from '../strings'
import type { Product } from '../types'

export interface ProductListProps {
  products: Product[]
  /** Display unit system; defaults to metric. Callers pass useDisplayUnitSystem(). */
  system?: 'metric' | 'imperial'
  /** WP11: the Archived filter is on and the list is empty -> "No archived Products". */
  showingArchived?: boolean
  /** The Ingredient is in the meta line ("Tomato passata · 700 g"); off on an Ingredient's own page ("700 g"). Default on. */
  showIngredient?: boolean
}

/** Products as a ListGroup of ListRows: name, "Ingredient · pack size" meta, chevron, an Archived chip when archived. Each links to /products/:id. */
export function ProductList({ products, system = 'metric', showingArchived = false, showIngredient = true }: ProductListProps) {
  if (products.length === 0) {
    return showingArchived ? <EmptyState title={strings.noArchivedProducts} /> : <EmptyState title={strings.productsEmpty} description={strings.productsEmptyHint} />
  }
  return (
    <ListGroup label={strings.productsTitle}>
      {products.map((p) => {
        const size = formatPackSize(p.packSize, p.baseUnit, system)
        return (
          <ListRow
            key={p.id}
            title={p.name}
            meta={showIngredient && p.ingredientName ? `${p.ingredientName} · ${size}` : size}
            chevron
            href={`/products/${p.id}`}
            trailing={p.archived ? <Chip kind="tag">{strings.archivedChip}</Chip> : undefined}
          />
        )
      })}
    </ListGroup>
  )
}
