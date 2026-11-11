import { EmptyState } from '../../../ui/EmptyState'
import { PageHeader } from '../../../ui/PageHeader'
import { ListGroup, ListRow } from '../../../ui/ListRow'
import { scanStrings } from '../strings'

export interface ShopPickerShop {
  id: number
  name: string
}

/** Finding the Shop the User is in from the phone's position (Shop Location). */
export interface ShopPickerNearby {
  /** the nearest Shop with its distance text ("40 m"), or null */
  nearest: { id: number; distance: string } | null
  status: 'idle' | 'locating' | 'ready' | 'failed'
  /** 'denied' when the User turned location off */
  failure: string | null
  /** false when no Shop has a Shop Location yet, so there is nothing to find */
  anyLocated: boolean
  onFind: () => void
}

export interface ShopPickerProps {
  shops: ShopPickerShop[]
  /** the last Shop used on this device, if it still exists */
  lastShopId: number | null
  onPick: (shop: ShopPickerShop) => void
  /** start a Stock-take at home (no Shop) */
  onStockTake: () => void
  nearby?: ShopPickerNearby
  /** opens "Add Shop" (any User, standing in it) */
  onAddShop?: () => void
}

function findMeta(nearby: ShopPickerNearby): string | undefined {
  if (nearby.status === 'locating') return scanStrings.findingNearest
  if (nearby.status === 'ready' && !nearby.nearest) return scanStrings.noShopNearby
  if (nearby.status === 'failed') return nearby.failure === 'denied' ? scanStrings.locationOff : scanStrings.locationFailed
  return undefined
}

/**
 * "Where are you shopping?": the Shop the User is in first (nearest by Shop Location, marked "You are here"), then the
 * last one used, then the rest by name; "Find the Shop I am in" and "Add the Shop I am in"; "Stock-take at home" last.
 */
export function ShopPicker({ shops, lastShopId, onPick, onStockTake, nearby, onAddShop }: ShopPickerProps) {
  const here = nearby?.nearest ? (shops.find((s) => s.id === nearby.nearest?.id) ?? null) : null
  const last = shops.find((s) => s.id === lastShopId && s.id !== here?.id) ?? null
  const others = shops.filter((s) => s.id !== last?.id && s.id !== here?.id).sort((a, b) => a.name.localeCompare(b.name))
  const ordered = [...(here ? [here] : []), ...(last ? [last] : []), ...others]
  const selectedId = here?.id ?? last?.id ?? null
  const showFind = nearby !== undefined && nearby.anyLocated && !here
  return (
    <section className="shop-picker">
      <PageHeader title={scanStrings.pickShop} subtitle={scanStrings.pickShopHint} />
      {shops.length === 0 ? <EmptyState icon="shops" title={scanStrings.noShops} description={scanStrings.noShopsHint} /> : null}
      <ListGroup label={scanStrings.shopsList}>
        {ordered.map((shop) => {
          const meta = shop.id === here?.id ? scanStrings.nearestMeta(nearby?.nearest?.distance ?? '') : shop.id === last?.id ? scanStrings.lastUsed : undefined
          return <ListRow key={shop.id} title={shop.name} icon="shops" meta={meta} selected={shop.id === selectedId} onActivate={() => onPick(shop)} />
        })}
        {showFind ? <ListRow title={scanStrings.findNearest} icon="location" meta={findMeta(nearby)} onActivate={nearby.onFind} /> : null}
        {onAddShop ? <ListRow title={scanStrings.addShopHere} icon="add" onActivate={onAddShop} /> : null}
        <ListRow title={scanStrings.stockTakeAtHome} icon="household" onActivate={onStockTake} />
      </ListGroup>
    </section>
  )
}
