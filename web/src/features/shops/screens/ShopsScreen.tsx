import { useMe } from '../../../app/useMe'
import { ShopList } from '../components/ShopList'
import { useShops } from '../hooks/useShops'
import { strings } from '../strings'
import '../../products/products.css'

/** /settings/shops: ShopList. Hooks: useShops, useMe (isAdmin). */
export function ShopsScreen() {
  const me = useMe()
  const { shops, isLoading, error, add } = useShops()
  return (
    <div className="pg">
      <h1 className="pg__title">{strings.shopsTitle}</h1>
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
