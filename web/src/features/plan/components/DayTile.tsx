import type { ReactNode } from 'react'
import { Tile } from '../../../ui'
import type { DayGroup } from '../lib/days'
import { MealTile, type MealTileProps } from './MealTile'
import '../plan.css'

export interface DayTileProps extends Omit<MealTileProps, 'slot'> {
  day: DayGroup
}

/** A day of the plan: today spans both columns of the grid (Tile size "full"), other days one (size "md"). */
export function DayTile({ day, ...handlers }: DayTileProps): ReactNode {
  return (
    <Tile as="article" size={day.span === 2 ? 'full' : 'md'} tone={day.isToday ? 'accent' : 'neutral'}>
      <h2 className="plan__day-title">{day.label}</h2>
      <div className="plan__stack">
        {day.slots.map((slot) => (
          <MealTile key={`${slot.date}/${slot.mealSlotId}`} slot={slot} {...handlers} />
        ))}
      </div>
    </Tile>
  )
}
