import type { ReactElement } from 'react'
import { Tile, TileMetric } from '../../../ui'
import { streakMetric } from '../lib/streak'
import { todayStrings as s } from '../strings'
import '../today.css'

export interface StreakTileProps {
  days: number
}

/** The zero-waste streak: a soft half tile with the big number ("3 wk", "5 d") and "zero-waste streak". Renders nothing for 0 days. */
export function StreakTile({ days }: StreakTileProps): ReactElement | null {
  if (days <= 0) return null
  const metric = streakMetric(days)
  return (
    <Tile as="section" variant="soft" aria-label={s.streakHeading}>
      <TileMetric value={metric.value} label={metric.label} />
    </Tile>
  )
}
