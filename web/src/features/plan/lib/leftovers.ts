import type { Leftover } from '../types'
import { formatPortions } from './cook'
import { dayNumber, weekdayName } from './phrase'

export interface LeftoverRow {
  id: number
  recipeName: string
  portions: string
  /** "Use by Thu", "Use by today". */
  useBy: string
  /** 'spoil' when the Use-by is today or tomorrow, otherwise 'leftover'. */
  tone: 'spoil' | 'leftover'
}

/** The rows of the "Leftovers to use" tile, soonest Use-by first. */
export function leftoverRows(leftovers: Leftover[], today: string): LeftoverRow[] {
  return [...leftovers]
    .sort((a, b) => a.useBy.localeCompare(b.useBy) || a.id - b.id)
    .map((l) => {
      const diff = dayNumber(l.useBy) - dayNumber(today)
      const when = diff <= 0 ? 'today' : diff === 1 ? 'tomorrow' : weekdayName(l.useBy, 'short')
      return {
        id: l.id,
        recipeName: l.recipeName,
        portions: formatPortions(l.portions),
        useBy: `Use by ${when}`,
        tone: diff <= 1 ? 'spoil' : 'leftover',
      }
    })
}
