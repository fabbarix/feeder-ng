import type { UnitSystem } from '../../../lib/units'
import { BentoGrid } from '../../../ui/BentoGrid'
import { EmptyState } from '../../../ui/EmptyState'
import { ProgressTile } from '../../../ui/ProgressTile'
import { listEntries, type ListEntry } from '../lib/lines'
import { shopStrings } from '../strings'
import type { ShoppingList } from '../types'
import { CostTile } from './CostTile'
import { LineTile } from './LineTile'

export interface ShoppingBodyProps {
  list: ShoppingList
  system: UnitSystem
  /** the Shop the list is priced at; null = none picked */
  shopName: string | null
  onTick: (entry: ListEntry) => void
  onUntick: (entry: ListEntry) => void
  onDelete: (entry: ListEntry) => void
  onScan: () => void
}

/** The list's tiles: how many are left and the estimate, the open entries, then the Ticked group. Render only. */
export function ShoppingBody({ list, system, shopName, onTick, onUntick, onDelete, onScan }: ShoppingBodyProps) {
  const { open, ticked } = listEntries(list, system)
  const left = list.progress.total - list.progress.ticked
  const empty = open.length === 0 && ticked.length === 0
  return (
    <>
      <BentoGrid columns={2}>
        <ProgressTile label={shopStrings.leftToGet} value={list.progress.ticked} max={list.progress.total} valueLabel={String(left)} />
        <CostTile estimatedCostCents={list.estimatedCostCents} unpriced={list.unpricedLines} currency={list.currency} shopName={shopName} onScan={onScan} />
      </BentoGrid>
      {empty ? <EmptyState title={shopStrings.empty} description={shopStrings.emptyHint} /> : null}
      <BentoGrid columns={2}>
        {open.map((entry) => (
          <LineTile key={entry.key} entry={entry} onTick={onTick} onUntick={onUntick} onDelete={entry.kind === 'extra' ? onDelete : undefined} />
        ))}
      </BentoGrid>
      {ticked.length > 0 ? (
        <section className="shop-ticked">
          <h2 className="shop-ticked__title">{shopStrings.tickedGroup(ticked.length)}</h2>
          <div role="group" aria-label={shopStrings.ticked}>
            <BentoGrid columns={2}>
              {ticked.map((entry) => (
                <LineTile key={entry.key} entry={entry} onTick={onTick} onUntick={onUntick} />
              ))}
            </BentoGrid>
          </div>
        </section>
      ) : null}
    </>
  )
}
