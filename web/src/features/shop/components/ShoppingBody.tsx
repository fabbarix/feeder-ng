// The Shop body (DS-SHOP, docs/design/system.md §3, §4): the metric strip, ONE notice, then ONE dense list of rows (a 2-column
// card grid from 768 px, the same rows). Ticked Lines sit in their own section; Not needed stays collapsed. Render only.
import { EmptyState } from '../../../ui/EmptyState'
import { ListGroup } from '../../../ui/ListRow'
import { useShopSummary } from '../hooks/useShopSummary'
import { listEntries, notNeededEntries, type ListEntry } from '../lib/lines'
import type { RowGroup } from '../lib/rows'
import { shopStrings } from '../strings'
import type { ShoppingList } from '../types'
import type { UnitSystem } from '../../../lib/units'
import { LineRow } from './LineRow'
import { NotNeededGroup } from './NotNeededGroup'
import { ShopMetrics } from './ShopMetrics'
import { UnconfirmedNotice } from './UnconfirmedNotice'

export interface ShoppingBodyProps {
  list: ShoppingList
  system: UnitSystem
  /** the Shop the list is priced at; null = none picked */
  shopName: string | null
  onTick: (entry: ListEntry) => void
  onUntick: (entry: ListEntry) => void
  /** a row was tapped: the screen opens its sheet */
  onOpenLine: (entry: ListEntry, group: RowGroup) => void
  onScan: () => void
  /** "Mark it" on the notice: opens the oldest unconfirmed slot */
  onMarkIt?: (slot: { date: string; mealSlotId: number }) => void
}

export function ShoppingBody({ list, system, shopName, onTick, onUntick, onOpenLine, onScan, onMarkIt }: ShoppingBodyProps) {
  const { summary, notice } = useShopSummary(list, shopName)
  const { open, ticked } = listEntries(list, system)
  const notNeeded = notNeededEntries(list, system)
  const empty = open.length === 0 && ticked.length === 0
  return (
    <>
      <ShopMetrics summary={summary} onScan={onScan} />
      {notice ? <UnconfirmedNotice notice={notice} onMarkIt={onMarkIt} /> : null}
      {empty ? <EmptyState title={shopStrings.empty} description={shopStrings.emptyHint} /> : null}
      {open.length > 0 ? (
        <section className="shop-open">
          <h2 className="shop-section__title">
            {shopStrings.toGet} <span className="shop-section__count">{open.length}</span>
          </h2>
          <div className="shop-lines">
            <ListGroup label={shopStrings.toGet}>
              {open.map((entry) => (
                <LineRow key={entry.key} entry={entry} group="open" onTick={onTick} onUntick={onUntick} onOpen={onOpenLine} />
              ))}
            </ListGroup>
          </div>
        </section>
      ) : null}
      {ticked.length > 0 ? (
        <section className="shop-ticked">
          <h2 className="shop-section__title">
            {shopStrings.ticked} <span className="shop-section__count">{ticked.length}</span>
          </h2>
          <div className="shop-lines">
            <ListGroup label={shopStrings.ticked}>
              {ticked.map((entry) => (
                <LineRow key={entry.key} entry={entry} group="ticked" onTick={onTick} onUntick={onUntick} onOpen={onOpenLine} />
              ))}
            </ListGroup>
          </div>
        </section>
      ) : null}
      <NotNeededGroup entries={notNeeded} onOpen={onOpenLine} />
    </>
  )
}
