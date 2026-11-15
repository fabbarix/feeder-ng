import { useState } from 'react'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { Chip, ErrorState, ListPage, LoadState, PageHeader, SearchField } from '../../../ui'
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
  const list = useProducts(q, archived)
  useProductsLiveUpdates()
  const system = useDisplayUnitSystem()
  const breadcrumbs = useBreadcrumbs()
  return (
    <ListPage
      header={<PageHeader title={strings.productsTitle} breadcrumbs={breadcrumbs} />}
      search={<SearchField label={strings.productsSearch} value={q} onChange={setQ} />}
      filters={
        <Chip kind="filter" selected={archived} onClick={() => setArchived((on) => !on)}>
          {strings.archivedFilter}
        </Chip>
      }
    >
      {/* B9-20 (RES-02): one state model; offline and never loaded is a LoadState, never an empty list. */}
      {list.state === 'loading' ? (
        <p role="status">{strings.loading}</p>
      ) : list.state === 'offlineUnknown' ? (
        <LoadState title={strings.offlineListTitle} text={strings.offlineListText} />
      ) : list.state === 'failed' ? (
        <ErrorState message={strings.listError} onRetry={list.refetch} />
      ) : (
        <ProductList products={applyArchivedFilter(list.products, archived)} system={system} showingArchived={archived} />
      )}
    </ListPage>
  )
}
