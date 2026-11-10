import type { ReactElement, ReactNode } from 'react'
import { BentoGrid, Button, EmptyState, PageHeader } from '../../../ui'
import { todayStrings as s } from '../strings'
import type { TodayLayout, TileId } from '../types'
import '../today.css'

export interface TodayViewProps {
  layout: TodayLayout
  loading?: boolean
  /** Subtitle under the title, lib/heading todayHeading(today), e.g. "Tue 10 Nov". */
  dateLabel?: string
  /** One element per tile id (built by TodayScreen from the owning features' components). */
  tiles: Partial<Record<TileId, ReactNode>>
  /** The Shopping List screen, shown instead of the grid while a scan session is active. */
  shopping: ReactNode
  /** Where the empty state's button goes. */
  onOpenPlan: () => void
}

/**
 * Renders a layout. Heading "Today". Mode shopping: only `shopping`. Mode today: a
 * BentoGrid (labelled "Today") with a slot per tile in layout order; each slot carries data-tile. When layout.empty,
 * the EmptyState shows above the grid (so any streak tile stays visible). While loading, "Loading" and no empty state.
 */
export function TodayView({ layout, loading = false, dateLabel, tiles, shopping, onOpenPlan }: TodayViewProps): ReactElement {
  if (layout.mode === 'shopping') return <>{shopping}</>
  return (
    <section className="today">
      <PageHeader title={s.title} subtitle={dateLabel} />
      {loading ? <p className="today__muted">{s.loading}</p> : null}
      {layout.empty && !loading ? (
        <EmptyState title={s.emptyTitle} description={s.emptyHint} action={<Button onClick={onOpenPlan}>{s.emptyAction}</Button>} />
      ) : null}
      <BentoGrid label={s.gridLabel}>
        {layout.tiles.map((spec) => {
          const node = tiles[spec.id]
          if (!node) return null
          return (
            <div key={spec.id} className="today__slot" data-tile={spec.id}>
              {node}
            </div>
          )
        })}
      </BentoGrid>
    </section>
  )
}
