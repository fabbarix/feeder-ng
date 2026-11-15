import type { ReactElement, ReactNode } from 'react'
import { BentoGrid, Button, EmptyState, ErrorState, LoadState, PageHeader } from '../../../ui'
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
  /** B9-39 (RES-02): offline and the plan never loaded: the LoadState under the header, and no tile, no empty state, no error. */
  offlineUnknown?: boolean
  /** B9-39 (TB-01): the polite announcement "Lunch moved to To confirm." (empty when there is nothing to say). */
  announce?: string
}

/**
 * Renders a layout. Heading "Today". Mode shopping: only `shopping`. Mode today: a
 * BentoGrid by minimum width (labelled "Today") with a slot per tile in layout order; each slot carries data-tile. When
 * layout.empty, the EmptyState shows above the grid (so the metric strip stays visible). While loading the section is
 * aria-busy and there is no text and no empty state (DS-TODAY).
 */
export function TodayView({ layout, loading = false, dateLabel, tiles, shopping, onOpenPlan, onRetry, offlineUnknown = false, announce = '' }: TodayViewProps): ReactElement {
  if (layout.mode === 'shopping') return <>{shopping}</>
  if (offlineUnknown) {
    return (
      <section className="today">
        <PageHeader title={s.title} subtitle={dateLabel} />
        <LoadState title={s.offlineUnknownTitle} text={s.offlineUnknownText} />
      </section>
    )
  }
  return (
    <section className="today" aria-busy={loading ? true : undefined}>
      <PageHeader title={s.title} subtitle={dateLabel} />
      {/* TB-01: a slot that joins To confirm takes no focus; this says so. Always in the page, so a change is announced. */}
      <p className="to-confirm__announce" aria-live="polite">
        {announce}
      </p>
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
