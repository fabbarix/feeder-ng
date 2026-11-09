import type { UnitSystem } from '../../../lib/units'
import { BentoGrid } from '../../../ui/BentoGrid'
import { EmptyState } from '../../../ui/EmptyState'
import { ProgressTile } from '../../../ui/ProgressTile'
import { listItems, type ListItem } from '../lib/lines'
import { shopStrings } from '../strings'
import type { ShoppingList } from '../types'
import { CostTile } from './CostTile'
import { ItemTile } from './ItemTile'
import { RangePicker } from './RangePicker'

export interface ShoppingBodyProps {
  list: ShoppingList
  system: UnitSystem
  onRangeChange: (to: string) => void
  onTick: (item: ListItem) => void
  onUntick: (item: ListItem) => void
  onDelete: (item: ListItem) => void
}

/** The list's tiles: progress and cost, the range, the open items, then the Done group. Render only. */
export function ShoppingBody({ list, system, onRangeChange, onTick, onUntick, onDelete }: ShoppingBodyProps) {
  const { open, done } = listItems(list, system)
  const empty = open.length === 0 && done.length === 0
  return (
    <>
      <BentoGrid columns={2}>
        <ProgressTile label={shopStrings.progress} value={list.progress.done} max={list.progress.total} />
        <CostTile costCents={list.estimatedCostCents} unpriced={list.unpricedLines} currency={list.currency} />
      </BentoGrid>
      <RangePicker today={list.today} maxTo={list.maxTo} to={list.to} onChange={onRangeChange} />
      {empty ? <EmptyState title={shopStrings.empty} description={shopStrings.emptyHint} /> : null}
      <BentoGrid columns={2}>
        {open.map((item) => (
          <ItemTile key={item.key} item={item} onTick={onTick} onUntick={onUntick} onDelete={item.kind === 'extra' ? onDelete : undefined} />
        ))}
      </BentoGrid>
      {done.length > 0 ? (
        <section className="shop-done">
          <h2 className="shop-done__title">{shopStrings.doneGroup(done.length)}</h2>
          <div role="group" aria-label={shopStrings.done}>
            <BentoGrid columns={2}>
              {done.map((item) => (
                <ItemTile key={item.key} item={item} onTick={onTick} onUntick={onUntick} />
              ))}
            </BentoGrid>
          </div>
        </section>
      ) : null}
    </>
  )
}
