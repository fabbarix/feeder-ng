// The Shop body (DS-SHOP, docs/design/system.md §3, §4): the metric strip, ONE notice, then ONE dense list of rows (a 2-column
// card grid from 768 px, the same rows). Food sits under "To get", open Supplies under their own "Supplies" group (H7′,
// household-items.md §4.4), Ticked Lines in their own section; Not needed stays collapsed. Render only.
// B9-34 (A11Y-07): each list keeps the focus of a row that leaves it (a tick, an untick, Not needed): the next row's tick, else the
// previous one's, else a section heading (ui/lib/useFocusKeeper). Each group sits in a wrapper that stays mounted (display: contents) so
// the keeper still sees the last row leave.
// B9-43 (SSP-09; mocks/ssp-09-complete.html): "Shopping List complete" sits under the metric strip, before the notice and the rows.
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useFocusKeeper } from '../../../ui/lib/useFocusKeeper'
import { EmptyState } from '../../../ui/EmptyState'
import { ListGroup } from '../../../ui/ListRow'
import { useShopSummary } from '../hooks/useShopSummary'
import { listEntries, notNeededEntries, type ListEntry } from '../lib/lines'
import { rowNames, type RowGroup } from '../lib/rows'
import { splitSupplies } from '../lib/supplies'
import { shopStrings } from '../strings'
import type { ShoppingList } from '../types'
import type { UnitSystem } from '../../../lib/units'
import { LineRow } from './LineRow'
import { NotNeededGroup } from './NotNeededGroup'
import { ShopMetrics } from './ShopMetrics'
import { UnconfirmedNotice } from './UnconfirmedNotice'
import { CelebrationTile, type CelebrationTileProps } from './CelebrationTile'

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
  /** B9-34: the keys of the rows whose tick is in flight (their tick is busy) */
  pendingKeys?: ReadonlySet<string>
  /**
   * B9-34 (A11Y-07): the key of a row whose tick takes the focus when it is (back) among the open rows, after an Undo; the focus moves only when it
   * was lost (on <body>), in a toast or on another row, never from a place the person chose. `onFocusRestored` clears it.
   */
  restoreFocusKey?: string | null
  onFocusRestored?: () => void
  /** B9-43 (SSP-09): the complete tile's props (hooks/useCompleteTile); null while the list is not complete */
  complete?: CelebrationTileProps | null
  /** B9-54 (RES-03): Ticks still waiting in the offline queue (the metric strip's "· 1 waiting") */
  waiting?: number
  /** B9-54: the keys of the open rows whose Tick was refused on sync ("Tick not synced") */
  failedKeys?: ReadonlySet<string>
  /** B9-54: the sync notices, above the metric strip */
  notices?: ReactNode
}

function useRestoreFocus(key: string | null | undefined, list: ShoppingList, done: (() => void) | undefined) {
  useEffect(() => {
    if (!key) return
    const tick = document.querySelector<HTMLElement>(`.shop-lines .list-row[data-state="open"][data-focus-key="${CSS.escape(key)}"] .line-row__tick`)
    if (!tick) return
    const active = document.activeElement
    if (!active || active === document.body || active.closest('.toast, .shop-lines')) tick.focus()
    done?.()
  }, [key, list, done])
}

/** A group's stable wrapper with its focus keeper; the heading is its own, else the first section heading left on the page. */
function KeptGroup({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusKeeper(ref, {
    heading: () =>
      ref.current?.querySelector<HTMLElement>('.shop-section__title') ??
      ref.current?.parentElement?.querySelector<HTMLElement>('.shop-section__title') ??
      document.querySelector<HTMLElement>('main h1, h1'),
  })
  return (
    <div ref={ref} className="shop-group">
      {children}
    </div>
  )
}

export function ShoppingBody({ list, system, shopName, onTick, onUntick, onOpenLine, onScan, onMarkIt, pendingKeys, restoreFocusKey, onFocusRestored, complete, waiting, failedKeys, notices }: ShoppingBodyProps) {
  useRestoreFocus(restoreFocusKey, list, onFocusRestored)
  const { summary, notice } = useShopSummary(list, shopName, waiting)
  const suppliesTitleId = useId()
  const { open, ticked } = listEntries(list, system)
  const { food, supplies } = splitSupplies(open)
  const notNeeded = notNeededEntries(list, system)
  // batch w5a (P38): two rows of one title on the page (a Line and its "more since your tick" row, a Line and an Ingredient extra) get
  // names that tell them apart
  const names = rowNames([...open, ...ticked, ...notNeeded])
  const empty = open.length === 0 && ticked.length === 0
  return (
    <>
      {notices}
      <ShopMetrics summary={summary} onScan={onScan} />
      {complete ? <CelebrationTile {...complete} /> : null}
      {notice ? <UnconfirmedNotice notice={notice} onMarkIt={onMarkIt} /> : null}
      {empty ? <EmptyState title={shopStrings.empty} description={shopStrings.emptyHint} /> : null}
      <KeptGroup>
        {food.length > 0 ? (
          <section className="shop-open">
            <h2 className="shop-section__title">
              {shopStrings.toGet} <span className="shop-section__count">{food.length}</span>
            </h2>
            <div className="shop-lines">
              <ListGroup label={shopStrings.toGet}>
                {food.map((entry) => (
                  <LineRow key={entry.key} entry={entry} group="open" onTick={onTick} onUntick={onUntick} onOpen={onOpenLine} pending={pendingKeys?.has(entry.key)} sync={failedKeys?.has(entry.key) ? 'failed' : undefined} name={names.get(entry.key)} />
                ))}
              </ListGroup>
            </div>
          </section>
        ) : null}
      </KeptGroup>
      <KeptGroup>
        {supplies.length > 0 ? (
          <section className="shop-supplies" aria-labelledby={suppliesTitleId}>
            <h2 id={suppliesTitleId} className="shop-section__title">
              {shopStrings.supplies} <span className="shop-section__count">{supplies.length}</span>
            </h2>
            <div className="shop-lines">
              <ListGroup label={shopStrings.supplies}>
                {supplies.map((entry) => (
                  <LineRow key={entry.key} entry={entry} group="open" onTick={onTick} onUntick={onUntick} onOpen={onOpenLine} pending={pendingKeys?.has(entry.key)} sync={failedKeys?.has(entry.key) ? 'failed' : undefined} name={names.get(entry.key)} />
                ))}
              </ListGroup>
            </div>
          </section>
        ) : null}
      </KeptGroup>
      <KeptGroup>
        {ticked.length > 0 ? (
          <section className="shop-ticked">
            <h2 className="shop-section__title">
              {shopStrings.ticked} <span className="shop-section__count">{ticked.length}</span>
            </h2>
            <div className="shop-lines">
              <ListGroup label={shopStrings.ticked}>
                {ticked.map((entry) => (
                  <LineRow key={entry.key} entry={entry} group="ticked" onTick={onTick} onUntick={onUntick} onOpen={onOpenLine} pending={pendingKeys?.has(entry.key)} name={names.get(entry.key)} />
                ))}
              </ListGroup>
            </div>
          </section>
        ) : null}
      </KeptGroup>
      <NotNeededGroup entries={notNeeded} onOpen={onOpenLine} names={names} />
    </>
  )
}
