import type { ReactElement } from 'react'
import { Tile } from '../../../ui'
import { todayStrings as s } from '../strings'
import '../today.css'

export interface StreakTileProps {
  days: number
}

/** The zero-waste streak: "5 days without throwing food away" ("1 day ..." for one). Renders nothing for 0 days. */
export function StreakTile({ days }: StreakTileProps): ReactElement | null {
  if (days <= 0) return null
  return (
    <Tile as="section" tone="accent" aria-label={s.streakHeading}>
      <h2 className="today__tile-title">{s.streakHeading}</h2>
      <p className="today__streak">{s.streak(days)}</p>
    </Tile>
  )
}
