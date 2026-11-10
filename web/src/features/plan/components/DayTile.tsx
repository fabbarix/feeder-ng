import type { ReactNode } from 'react'
import { Tile } from '../../../ui'
import type { DayGroup } from '../lib/days'
import type { MealTileProps } from './MealTile'
import { MealTile } from './MealTile'
import '../plan.css'

export interface DayTileProps extends Omit<MealTileProps, 'slot'> {
  day: DayGroup
  /** The 7-column week: the short weekday as heading ("Wed"). */
  compact?: boolean
}

/**
 * A day of the plan: Tile variant surface, overline = day.overline ("WED 11"), h2 = day.title, MealTiles inside.
 * Today spans 2 columns (span=2; one column when compact, 7 columns) and carries data-today (a 2 px accent ring in CSS,
 * not another fill). Cooked days stay readable; the divider between meals shows only with 3 or more (data-dividers).
 */
export function DayTile({ day, compact = false, ...handlers }: DayTileProps): ReactNode {
  return (
    <Tile
      as="article"
      variant="surface"
      span={day.span}
      overline={day.overline}
      className="plan-day"
      data-today={day.isToday ? 'true' : undefined}
      data-dividers={day.slots.length >= 3 ? 'true' : undefined}
    >
      <h2 className="plan-day__title">{compact ? day.shortTitle : day.title}</h2>
      {day.slots.map((slot) => (
        <MealTile key={slot.mealSlotId} slot={slot} {...handlers} />
      ))}
    </Tile>
  )
}
