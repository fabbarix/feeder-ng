import type { Price, Shop } from '../types'

export interface PriceListProps {
  prices: Price[]
  shops: Shop[]
  currency: string
  onDelete: (priceId: number) => void
}

/** Rows "Corner Market · 2026-11-05 · $1.59 · $2.27 / kg (worked out from the pack size)", newest first as given. */
export function PriceList(props: PriceListProps): never {
  void props
  throw new Error('TODO')
}
