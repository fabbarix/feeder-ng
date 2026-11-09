import type { ReactElement } from 'react'

export interface StreakTileProps {
  days: number
}

/** The zero-waste streak: "5 days without throwing food away" ("1 day ..." for one). Renders nothing for 0 days. Not implemented yet. */
export function StreakTile(_props: StreakTileProps): ReactElement | null {
  throw new Error('StreakTile: not implemented')
}
