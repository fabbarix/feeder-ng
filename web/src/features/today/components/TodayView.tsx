import type { ReactElement, ReactNode } from 'react'
import type { TileId, TodayLayout } from '../types'

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
 * BentoGrid (labelled "Today") with a Tile wrapper per spec, in layout order, each
 * holding tiles[id] and carrying the spec's size and tone. When layout.empty, the
 * illustrated EmptyState (todayStrings.emptyTitle / emptyHint / button "Open the Plan")
 * shows above any streak tile. While loading, "Loading". Not implemented yet.
 */
export function TodayView(_props: TodayViewProps): ReactElement {
  throw new Error('TodayView: not implemented')
}
