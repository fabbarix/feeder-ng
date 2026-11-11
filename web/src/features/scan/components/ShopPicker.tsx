import { EmptyState } from '../../../ui/EmptyState'
import { PageHeader } from '../../../ui/PageHeader'
import { ListGroup, ListRow } from '../../../ui/ListRow'
import { scanStrings } from '../strings'

export interface ShopPickerShop {
  id: number
  name: string
}

export interface ShopPickerProps {
  shops: ShopPickerShop[]
  /** the last Shop used on this device, if it still exists */
  lastShopId: number | null
  onPick: (shop: ShopPickerShop) => void
  /** start a Stock-take at home (no Shop) */
  onStockTake: () => void
}

/** "Where are you shopping?": a list of the Shops, the last one used first and marked, then "Stock-take at home". */
export function ShopPicker({ shops, lastShopId, onPick, onStockTake }: ShopPickerProps) {
  const last = shops.find((s) => s.id === lastShopId) ?? null
  const others = shops.filter((s) => s.id !== last?.id).sort((a, b) => a.name.localeCompare(b.name))
  const ordered = last ? [last, ...others] : others
  return (
    <section className="shop-picker">
      <PageHeader title={scanStrings.pickShop} subtitle={scanStrings.pickShopHint} />
      {shops.length === 0 ? <EmptyState icon="shops" title={scanStrings.noShops} description={scanStrings.noShopsHint} /> : null}
      <ListGroup label={scanStrings.shopsList}>
        {ordered.map((shop) => {
          const isLast = shop.id === last?.id
          return (
            <ListRow key={shop.id} title={shop.name} icon="shops" meta={isLast ? scanStrings.lastUsed : undefined} selected={isLast} onActivate={() => onPick(shop)} />
          )
        })}
        <ListRow title={scanStrings.stockTakeAtHome} icon="household" onActivate={onStockTake} />
      </ListGroup>
    </section>
  )
}
