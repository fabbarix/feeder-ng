import { useId, useState } from 'react'
import { Button, Cluster, Icon, Muted } from '../../../ui'
import { olderPrices, priceRows } from '../lib/priceRows'
import { strings } from '../strings'
import type { Price, Shop } from '../types'
import { PriceList } from './PriceList'
import '../products.css'

export interface ProductPricesProps {
  latest: Price[]
  /** Every recorded Price, newest first. */
  all: Price[]
  shops: Shop[]
  currency: string
  /** YYYY-MM-DD: the year shows only on a Price of another year. */
  today: string
  onOpen: (price: Price) => void
  onAdd: () => void
}

/**
 * SET-04: "Latest at each Shop" as rows, the outline disclosure "Price history · N older" (only when there are older Prices; it never
 * repeats a latest row), then an outline "Add Price".
 */
export function ProductPrices({ latest, all, shops, currency, today, onOpen, onAdd }: ProductPricesProps) {
  const [open, setOpen] = useState(false)
  const historyId = useId()
  const older = olderPrices(latest, all)
  return (
    <>
      {latest.length === 0 ? (
        <Muted>{strings.noPrices}</Muted>
      ) : (
        <>
          <h3 className="product-subhead">{strings.latestAtEachShop}</h3>
          <PriceList rows={priceRows(latest, shops, currency, today)} label={strings.latestAtEachShop} onOpen={onOpen} />
        </>
      )}
      {older.length > 0 ? (
        <>
          <Cluster>
            <Button variant="secondary" size="sm" className="product-history" aria-expanded={open} aria-controls={historyId} onClick={() => setOpen((o) => !o)}>
              {strings.priceHistoryOlder(older.length)}
              <Icon name="chevron" size={16} />
            </Button>
          </Cluster>
          <div id={historyId} hidden={!open}>
            {open ? <PriceList rows={priceRows(older, shops, currency, today)} label={strings.priceHistory} onOpen={onOpen} /> : null}
          </div>
        </>
      ) : null}
      <Cluster>
        <Button variant="secondary" icon="add" onClick={onAdd}>
          {strings.addPrice}
        </Button>
      </Cluster>
    </>
  )
}
