import type { ReactNode } from 'react'
import type { DayGroup } from '../lib/days'
import type { MealTileProps } from './MealTile'

export interface DayTileProps extends Omit<MealTileProps, 'slot'> {
  day: DayGroup
}

/** A day of the plan: today spans both columns of the grid (Tile size "full"), other days one (size "md"). */
export function DayTile(props: DayTileProps): ReactNode {
  void props
  return null
}
