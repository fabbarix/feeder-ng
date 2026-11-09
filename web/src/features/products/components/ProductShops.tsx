import { Chip } from '../../../ui'
import { strings } from '../strings'
import type { Shop } from '../types'
import '../products.css'

export interface ProductShopsProps {
  allShops: Shop[]
  soldAt: Shop[]
  onToggle: (shopId: number, sells: boolean) => void
}

/** One selectable Chip per Shop; selected = known to sell the Product. */
export function ProductShops({ allShops, soldAt, onToggle }: ProductShopsProps) {
  if (allShops.length === 0) return <p className="pg__muted">{strings.noShopsHint}</p>
  return (
    <div className="pg__row">
      {allShops.map((s) => {
        const sells = soldAt.some((x) => x.id === s.id)
        return (
          <Chip key={s.id} selected={sells} tone={sells ? 'accent' : 'neutral'} onClick={() => onToggle(s.id, !sells)}>
            {s.name}
          </Chip>
        )
      })}
    </div>
  )
}
