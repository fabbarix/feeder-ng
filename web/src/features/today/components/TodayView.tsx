import type { ReactElement, ReactNode } from 'react'
import { BentoGrid, Button, EmptyState, ErrorState, PageHeader } from '../../../ui'
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
  /** Where the error's Try again goes. */
  onRetry?: () => void
}

/**
 * Renders a layout. Heading "Today". Mode shopping: only `shopping`. Mode today: a
 * BentoGrid by minimum width (labelled "Today") with a slot per tile in layout order; each slot carries data-tile. When
 * layout.empty, the EmptyState shows above the grid (so the metric strip stays visible). While loading the section is
 * aria-busy and there is no text and no empty state (DS-TODAY).
 */
export function TodayView({ layout, loading = false, dateLabel, tiles, shopping, onOpenPlan, onRetry }: TodayViewProps): ReactElement {
  if (layout.mode === 'shopping') return <>{shopping}</>
  return (
    <section className="today" aria-busy={loading ? true : undefined}>
      <PageHeader title={s.title} subtitle={dateLabel} />
      {layout.failed && !loading ? <ErrorState message={s.loadError} onRetry={onRetry} /> : null}
      {layout.empty && !loading ? (
        <EmptyState title={s.emptyTitle} description={s.emptyHint} action={<Button onClick={onOpenPlan}>{s.emptyAction}</Button>} />
      ) : null}
      <BentoGrid min="wide" label={s.gridLabel}>
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
