import { useState } from 'react'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { Button, Chip, ErrorState, ListPage, LoadState, PageHeader, SearchField } from '../../../ui'
import { NewProductSheet } from '../components/NewProductSheet'
import { ProductList } from '../components/ProductList'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { applyArchivedFilter } from '../lib/archive'
import { useCreateProduct } from '../hooks/useCreateProduct'
import { useProducts } from '../hooks/useProducts'
import { useProductsLiveUpdates } from '../hooks/useProductsLiveUpdates'
import { strings } from '../strings'

/** /products: "New Product" (SET-14a), search field, the Archived filter chip (off: active Products only), ProductList. Hook: useProducts. */
export function ProductsScreen() {
  const [q, setQ] = useState('')
  const [archived, setArchived] = useState(false)
  const list = useProducts(q, archived)
  useProductsLiveUpdates()
  const system = useDisplayUnitSystem()
  const breadcrumbs = useBreadcrumbs()
  const [creating, setCreating] = useState(false)
  const create = useCreateProduct()
  return (
    <ListPage
      header={
        <PageHeader
          title={strings.productsTitle}
          breadcrumbs={breadcrumbs}
          actions={
            <Button icon="add" onClick={() => setCreating(true)}>
              {strings.newProduct}
            </Button>
          }
        />
      }
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
      <NewProductSheet
        open={creating}
        onClose={() => setCreating(false)}
        onSubmit={async (body) => {
          await create(body)
          setCreating(false)
        }}
      />
    </ListPage>
  )
}
