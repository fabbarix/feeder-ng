import { useState } from 'react'
import { Chip, PageHeader, SearchField } from '../../../ui'
import { ProductList } from '../components/ProductList'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { applyArchivedFilter } from '../lib/archive'
import { useProducts } from '../hooks/useProducts'
import { useProductsLiveUpdates } from '../hooks/useProductsLiveUpdates'
import { strings } from '../strings'

/** /products: search field, the Archived filter chip (off: active Products only), ProductList. Hook: useProducts. */
export function ProductsScreen() {
  const [q, setQ] = useState('')
  const [archived, setArchived] = useState(false)
  const { products, isLoading, error } = useProducts(q, archived)
  useProductsLiveUpdates()
  const system = useDisplayUnitSystem()
  return (
    <div className="pg">
      <PageHeader title={strings.productsTitle} />
      <SearchField label={strings.productsSearch} value={q} onChange={setQ} />
      <div>
        <Chip kind="filter" selected={archived} onClick={() => setArchived((on) => !on)}>
          {strings.archivedFilter}
        </Chip>
      </div>
      {error ? (
        <p role="alert">{strings.actionFailed}</p>
      ) : isLoading ? (
        <p role="status">{strings.loading}</p>
      ) : (
        <ProductList products={applyArchivedFilter(products, archived)} system={system} showingArchived={archived} />
      )}
    </div>
  )
}
