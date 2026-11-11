import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { PageHeader } from '../../../ui'
import { ShopList } from '../components/ShopList'
import { useProductsLiveUpdates } from '../../products/hooks/useProductsLiveUpdates'
import { useShops } from '../hooks/useShops'
import { strings } from '../strings'
import '../../products/products.css'

/** /settings/shops: ShopList. Hooks: useShops. */
export function ShopsScreen() {
  const breadcrumbs = useBreadcrumbs()
  const { shops, isLoading, error } = useShops()
  useProductsLiveUpdates()
  return (
    <div className="pg">
      <PageHeader title={strings.shopsTitle} breadcrumbs={breadcrumbs} />
      {error ? (
        <p role="alert">{strings.actionFailed}</p>
      ) : isLoading ? (
        <p role="status">{strings.loading}</p>
      ) : (
        <ShopList shops={shops} />
      )}
    </div>
  )
}
