import type { CSSProperties, ReactNode } from 'react'
import { Tile } from '../../../ui'
import type { DayGroup } from '../lib/days'
import { useAwayDay } from '../hooks/useAwayDay'
import type { Away } from '../types'
import { AwayDayLine } from './AwayDayLine'
import type { MealTileProps } from './MealTile'
import { MealTile } from './MealTile'
import '../plan.css'

export interface DayTileProps extends Omit<MealTileProps, 'slot'> {
  day: DayGroup
  /** B9-32 (PC-11): the tracks (of 12) the day spans in the week grid (an inline grid-column). */
  span?: number
  /** B9-32: the day has the whole row: its Meal Slots lie side by side (data-row). */
  wholeRow?: boolean
  /** B9-46 (PC-08): the plan's Aways (GET /api/plan `away`): the day's Away lines and the slots' "Ben away" labels read them. */
  aways?: Away[]
  /** B9-46: the day's Away line opens that Away. */
  onAway?: (away: Away) => void
}

/**
 * A day of the plan (ds-plan, docs/design/system.md §4): a surface Tile, one grid track like every other day. Its title is
 * one title-3 line ("Thu 12 · Today"), then the Meal Slots. Today carries data-today (the accent ring, not a bigger tile);
 * the divider between slots shows only with 3 or more (data-dividers).
 */
export function DayTile({ day, span, wholeRow, aways, onAway, ...handlers }: DayTileProps): ReactNode {
  // B9-46 (PC-08): a whole-day Away is one line under the title; a part-day Away labels the Meal Slots it covers.
  const away = useAwayDay(day.date, day.slots, aways)
  return (
    <Tile
      as="article"
      variant="surface"
      className="plan-day"
      data-today={day.isToday ? 'true' : undefined}
      data-dividers={day.slots.length >= 3 ? 'true' : undefined}
      data-row={wholeRow ? 'true' : undefined}
      style={span || wholeRow ? ({ gridColumn: span ? `span ${span}` : undefined, '--plan-slots': wholeRow ? day.slots.length : undefined } as CSSProperties) : undefined}
    >
      <h2 className="plan-day__title">{day.heading}</h2>
      {away.lines.map((line) => (
        <AwayDayLine key={line.away.id} line={line} onAway={onAway} />
      ))}
      {day.slots.map((slot) => (
        <MealTile key={slot.mealSlotId} slot={slot} awayLabel={away.slotLabels[slot.mealSlotId]} {...handlers} />
      ))}
    </Tile>
  )
}
