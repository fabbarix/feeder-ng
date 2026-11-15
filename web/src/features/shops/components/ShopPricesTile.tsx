import { useEffect, useId, useRef, useState } from 'react'
import { Button, ErrorState, ListGroup, ListRow, Muted, SectionTitle, Thumb, Tile } from '../../../ui'
import { SkeletonGroup, SkeletonList } from '../../../ui/Skeleton'
import type { UseShopPrices } from '../hooks/useShopPrices'
import { hiddenPriceCount, SHOP_PRICES_SHOWN, shownPriceRows } from '../lib/shopPrices'
import { strings } from '../strings'

export interface ShopPricesTileProps {
  shopName: string
  prices: UseShopPrices
}

/**
 * SET-02: "Prices known here": the count at the header's end, a note, then a row per Product (Thumb, name, date, price and price per
 * kg in the value column, a chevron to the Product). The first 8 show; "Show all N Prices" expands the list in place.
 */
export function ShopPricesTile({ shopName, prices }: ShopPricesTileProps) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const focusNext = useRef(false)
  const hidden = hiddenPriceCount(prices.rows)
  const shown = shownPriceRows(prices.rows, expanded)

  // After "Show all", focus goes to the first newly shown row.
  useEffect(() => {
    if (!expanded || !focusNext.current) return
    focusNext.current = false
    listRef.current?.querySelectorAll<HTMLElement>('.list-row a')[SHOP_PRICES_SHOWN]?.focus()
  }, [expanded])

  return (
    <Tile as="section" span="full" aria-label={strings.pricesKnownTitle}>
      <div className="shop-prices__head">
        <SectionTitle>{strings.pricesKnownTitle}</SectionTitle>
        {prices.rows.length > 0 ? <span className="shop-prices__count">{strings.pricesCount(prices.rows.length)}</span> : null}
      </div>
      {prices.state === 'loading' ? (
        <SkeletonGroup label={strings.pricesLoading}>
          <SkeletonList rows={3} />
        </SkeletonGroup>
      ) : prices.state === 'error' ? (
        <ErrorState message={strings.pricesError} onRetry={prices.refetch} />
      ) : prices.rows.length === 0 ? (
        <Muted>{strings.pricesEmpty(shopName)}</Muted>
      ) : (
        <>
          <Muted>{strings.pricesNote(shopName)}</Muted>
          <div ref={listRef} id={listId}>
            <ListGroup label={strings.pricesKnownTitle}>
              {shown.map((row) => (
                <ListRow
                  key={row.id}
                  title={row.name}
                  aria-label={row.label}
                  leading={<Thumb name={row.name} imageUrl={row.imageUrl} size={40} />}
                  meta={row.meta}
                  value={row.value}
                  subValue={row.subValue}
                  chevron
                  href={row.href}
                />
              ))}
            </ListGroup>
          </div>
          {hidden > 0 ? (
            <Button
              variant="secondary"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => {
                focusNext.current = !expanded
                setExpanded((e) => !e)
              }}
            >
              {strings.showAllPrices(prices.rows.length)}
            </Button>
          ) : null}
        </>
      )}
    </Tile>
  )
}
