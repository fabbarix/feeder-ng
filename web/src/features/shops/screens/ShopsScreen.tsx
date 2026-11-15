import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { ErrorState, ListPage, LoadState, PageHeader } from '../../../ui'
import { ShopList } from '../components/ShopList'
import { useProductsLiveUpdates } from '../../products/hooks/useProductsLiveUpdates'
import { useShops } from '../hooks/useShops'
import { strings } from '../strings'
import '../../products/products.css'

/** /settings/shops: ShopList. Hooks: useShops. */
export function ShopsScreen() {
  const breadcrumbs = useBreadcrumbs()
  const list = useShops()
  useProductsLiveUpdates()
  return (
    <ListPage header={<PageHeader title={strings.shopsTitle} breadcrumbs={breadcrumbs} />}>
      {/* B9-20 (RES-02): one state model; offline and never loaded is a LoadState, never an empty list. */}
      {list.state === 'loading' ? (
        <p role="status">{strings.loading}</p>
      ) : list.state === 'offlineUnknown' ? (
        <LoadState title={strings.offlineListTitle} text={strings.offlineListText} />
      ) : list.state === 'failed' ? (
        <ErrorState message={strings.listError} onRetry={list.refetch} />
      ) : (
        <ShopList shops={list.shops} />
      )}
    </ListPage>
  )
}
