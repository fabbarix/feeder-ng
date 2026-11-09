import { Button } from '../../../ui'
import { formatMinor, formatPricePerKg } from '../lib/money'
import { strings } from '../strings'
import type { Price, Shop } from '../types'
import '../products.css'

export interface PriceListProps {
  prices: Price[]
  shops: Shop[]
  currency: string
  onDelete: (priceId: number) => void
}

/** Rows "Corner Market · 2026-11-05 · $1.59 · $2.27 / kg (worked out from the pack size)", newest first as given. */
export function PriceList({ prices, shops, currency, onDelete }: PriceListProps) {
  if (prices.length === 0) return <p className="pg__muted">{strings.noPrices}</p>
  const shopName = (id: number) => shops.find((s) => s.id === id)?.name ?? strings.unknownShop
  return (
    <ul className="pg__list">
      {prices.map((p) => {
        const parts = [shopName(p.shopId), p.date]
        if (p.priceCents != null) parts.push(formatMinor(p.priceCents, currency))
        if (p.pricePerKgCents != null) {
          const perKg = formatPricePerKg(p.pricePerKgCents, currency)
          parts.push(p.pricePerKgDerived ? `${perKg} (${strings.derivedPerKg})` : perKg)
        }
        return (
          <li key={p.id} className="pg__row pg__row--between">
            <span>{parts.join(' · ')}</span>
            <Button variant="ghost" aria-label={`${strings.deletePrice}: ${parts.slice(0, 2).join(' ')}`} onClick={() => onDelete(p.id)}>
              {strings.deletePrice}
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
