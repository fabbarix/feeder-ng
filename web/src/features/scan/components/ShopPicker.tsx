import type { Shop } from '../../products/types'

export interface ShopPickerProps {
  shops: Shop[]
  /** the last Shop used on this device, if it still exists */
  lastShopId: number | null
  onPick: (shop: Shop) => void
  /** start a Stock-take at home (no Shop) */
  onStockTake: () => void
}

/**
 * "Where are you shopping?" (functional spec §10.1): the last Shop used as a prominent tile first (named
 * "<name> (last used)"), then the other Shops as tiles, then a "Stock-take at home" tile. Each is a button.
 * With no Shops it explains that the Admin adds Shops in Settings and still offers the Stock-take. Render and wire only.
 * Stub until implemented.
 */
export function ShopPicker(props: ShopPickerProps) {
  void props
  return null
}
