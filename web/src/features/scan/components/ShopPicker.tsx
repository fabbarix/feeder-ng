import { Button } from '../../../ui/Button'
import { Tile } from '../../../ui/Tile'
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

/** "Where are you shopping?": the last Shop first, the others by name, then Stock-take at home. */
export function ShopPicker({ shops, lastShopId, onPick, onStockTake }: ShopPickerProps) {
  const last = shops.find((s) => s.id === lastShopId) ?? null
  const others = shops.filter((s) => s.id !== last?.id).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <section className="shop-picker">
      <h1 className="shop-picker__title">{scanStrings.pickShop}</h1>
      <p className="shop-picker__hint">{scanStrings.pickShopHint}</p>
      {shops.length === 0 ? <p className="shop-picker__empty">No Shops yet. Your Admin adds Shops in Settings.</p> : null}
      {last ? (
        <Tile as="section" tone="accent" onClick={() => onPick(last)} className="shop-picker__tile">
          {`${last.name} (last used)`}
        </Tile>
      ) : null}
      {others.map((shop) => (
        <Tile key={shop.id} onClick={() => onPick(shop)} className="shop-picker__tile">
          {shop.name}
        </Tile>
      ))}
      <Button variant="tonal" onClick={onStockTake}>
        {scanStrings.stockTakeAtHome}
      </Button>
    </section>
  )
}
