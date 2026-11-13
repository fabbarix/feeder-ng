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
 * A day of the plan (ds-plan, docs/design/system.md §4): a surface Tile, one grid track like every other day. Its title is
 * one title-3 line ("Thu 12 · Today"), then the Meal Slots. Today carries data-today (the accent ring, not a bigger tile);
 * the divider between slots shows only with 3 or more (data-dividers).
 */
export function DayTile({ day, ...handlers }: DayTileProps): ReactNode {
  return (
    <Tile
      as="article"
      variant="surface"
      className="plan-day"
      data-today={day.isToday ? 'true' : undefined}
      data-dividers={day.slots.length >= 3 ? 'true' : undefined}
    >
      <h2 className="plan-day__title">{day.heading}</h2>
      {day.slots.map((slot) => (
        <MealTile key={slot.mealSlotId} slot={slot} {...handlers} />
      ))}
    </Tile>
  )
}
