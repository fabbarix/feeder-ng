import type { UnitSystem } from '../../../lib/units'
import { BentoGrid } from '../../../ui/BentoGrid'
import { EmptyState } from '../../../ui/EmptyState'
import { ProgressTile } from '../../../ui/ProgressTile'
import { listEntries, type ListEntry } from '../lib/lines'
import { shopStrings } from '../strings'
import type { ShoppingList } from '../types'
import { CostTile } from './CostTile'
import { LineTile } from './LineTile'
import { RangePicker } from './RangePicker'

export interface ShoppingBodyProps {
  list: ShoppingList
  system: UnitSystem
  onRangeChange: (to: string) => void
  onTick: (entry: ListEntry) => void
  onUntick: (entry: ListEntry) => void
  onDelete: (entry: ListEntry) => void
}

/** The list's tiles: progress and cost, the range, the open entries, then the Ticked group. Render only. */
export function ShoppingBody({ list, system, onRangeChange, onTick, onUntick, onDelete }: ShoppingBodyProps) {
  const { open, ticked } = listEntries(list, system)
  const empty = open.length === 0 && ticked.length === 0
  return (
    <>
      <BentoGrid columns={2}>
        <ProgressTile label={shopStrings.progress} value={list.progress.ticked} max={list.progress.total} />
        <CostTile estimatedCostCents={list.estimatedCostCents} unpriced={list.unpricedLines} currency={list.currency} />
      </BentoGrid>
      <RangePicker today={list.today} maxTo={list.maxTo} to={list.to} onChange={onRangeChange} />
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
