import { useMe } from '../../../app/useMe'
import { PageHeader } from '../../../ui'
import { ShopList } from '../components/ShopList'
import { useProductsLiveUpdates } from '../../products/hooks/useProductsLiveUpdates'
import { useShops } from '../hooks/useShops'
import { strings } from '../strings'
import '../../products/products.css'

/** /settings/shops: ShopList. Hooks: useShops, useMe (isAdmin). */
export function ShopsScreen() {
  const me = useMe()
  const { shops, isLoading, error, add } = useShops()
  useProductsLiveUpdates()
  return (
    <div className="pg">
      <PageHeader title={strings.shopsTitle} />
      {error ? (
        <p role="alert">{strings.actionFailed}</p>
      ) : isLoading ? (
        <p role="status">{strings.loading}</p>
      ) : (
        <ShopList shops={shops} isAdmin={Boolean(me.data?.isAdmin)} onAdd={async (name) => void (await add(name))} />
      )}
    </div>
  )
}
