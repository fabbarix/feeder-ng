import { Chip, Cluster, Muted } from '../../../ui'
import { strings } from '../strings'
import type { Shop } from '../types'
import '../products.css'

export interface ProductShopsProps {
  allShops: Shop[]
  soldAt: Shop[]
  onToggle: (shopId: number, sells: boolean) => void
}

/** One filter Chip per Shop; selected = known to sell the Product. */
export function ProductShops({ allShops, soldAt, onToggle }: ProductShopsProps) {
  if (allShops.length === 0) return <Muted>{strings.noShopsHint}</Muted>
  return (
    <Cluster>
      {allShops.map((s) => {
        const sells = soldAt.some((x) => x.id === s.id)
        return (
          <Chip key={s.id} kind="filter" selected={sells} onClick={() => onToggle(s.id, !sells)}>
            {s.name}
          </Chip>
        )
      })}
    </Cluster>
  )
}
