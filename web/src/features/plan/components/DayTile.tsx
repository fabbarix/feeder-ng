import type { ReactNode } from 'react'
import type { DayGroup } from '../lib/days'
import type { MealTileProps } from './MealTile'
import '../plan.css'

export interface DayTileProps extends Omit<MealTileProps, 'slot'> {
  day: DayGroup
}

/**
 * A day of the plan: Tile variant surface, overline = day.overline ("WED 11"), h2 = day.title, MealTiles inside.
 * Today spans 2 columns (span=2) and carries data-today (a 2 px accent ring in CSS, not another fill). Cooked days
 * stay readable; no divider line between meals unless there are 3 or more.
 */
export function DayTile(_props: DayTileProps): ReactNode {
  throw new Error('not implemented (WP6)')
}
