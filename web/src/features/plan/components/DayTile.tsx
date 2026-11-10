import type { ReactNode } from 'react'
import { Tile } from '../../../ui'
import type { DayGroup } from '../lib/days'
import type { MealTileProps } from './MealTile'
import { MealTile } from './MealTile'
import '../plan.css'

export interface DayTileProps extends Omit<MealTileProps, 'slot'> {
  day: DayGroup
}

/**
 * A day of the plan: Tile variant surface, overline = day.overline ("WED 11"), h2 = day.title, MealTiles inside.
 * Today spans 2 columns (span=2) and carries data-today (a 2 px accent ring in CSS, not another fill). Cooked days
 * stay readable; no divider line between meals unless there are 3 or more.
 */
export function DayTile({ day, ...handlers }: DayTileProps): ReactNode {
  return (
    <Tile
      as="article"
      variant="surface"
      span={day.span}
      overline={day.overline}
      className="plan-day"
      data-today={day.isToday ? 'true' : undefined}
    >
      <h2 className="plan-day__title">{day.title}</h2>
      {day.slots.map((slot) => (
        <MealTile key={slot.mealSlotId} slot={slot} {...handlers} />
      ))}
    </Tile>
  )
}
