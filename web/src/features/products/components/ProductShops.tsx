import type { Shop } from '../types'

export interface ProductShopsProps {
  allShops: Shop[]
  soldAt: Shop[]
  onToggle: (shopId: number, sells: boolean) => void
}

/** One selectable Chip per Shop; selected = known to sell the Product. */
export function ProductShops(props: ProductShopsProps): never {
  void props
  throw new Error('TODO')
}
