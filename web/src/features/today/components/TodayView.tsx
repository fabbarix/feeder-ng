import type { ReactElement, ReactNode } from 'react'
import { BentoGrid, Button, EmptyState } from '../../../ui'
import { todayStrings as s } from '../strings'
import type { TileId, TodayLayout } from '../types'
import '../today.css'

export interface TodayViewProps {
  layout: TodayLayout
  loading?: boolean
  /** One element per tile id (built by TodayScreen from the owning features' components). */
  tiles: Partial<Record<TileId, ReactNode>>
  /** The Shopping List screen, shown instead of the grid while a scan session is active. */
  shopping: ReactNode
  /** Where the empty state's button goes. */
  onOpenPlan: () => void
}

/**
 * Renders a layout. Heading "Today". Mode shopping: only `shopping`. Mode today: a
 * BentoGrid (labelled "Today") with a slot per tile in layout order, each carrying the
 * spec's size and tone. When layout.empty, the EmptyState shows above the grid (so
 * any streak tile stays visible). While loading, "Loading" and no empty state.
 */
export function TodayView({ layout, loading = false, tiles, shopping, onOpenPlan }: TodayViewProps): ReactElement {
  if (layout.mode === 'shopping') return <>{shopping}</>
  return (
    <section className="today">
      <h1 className="today__title">{s.title}</h1>
      {loading ? <p className="today__muted">{s.loading}</p> : null}
      {layout.empty && !loading ? (
        <EmptyState
          title={s.emptyTitle}
          description={s.emptyHint}
          action={<Button onClick={onOpenPlan}>{s.emptyAction}</Button>}
        />
      ) : null}
      <BentoGrid label={s.gridLabel}>
        {layout.tiles.map((spec) => {
          const node = tiles[spec.id]
          if (!node) return null
          return (
            <div key={spec.id} className="today__slot" data-size={spec.size} data-tone={spec.tone}>
              {node}
            </div>
          )
        })}
      </BentoGrid>
    </section>
  )
}
