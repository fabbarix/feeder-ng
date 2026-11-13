import type { Leftover as LeftoverLike } from '../types'
import type { Leftover } from '../../../lib/leftovers/types'
import { formatPortions } from './cook'
import { dayNumber, weekdayName } from './phrase'

/** A Leftover as the lib's by-hand actions need it: an older payload without the beta.5 fields reads as not frozen, not to answer. */
export function asLeftover(l: LeftoverLike): Leftover {
  return {
    ...l,
    storagePlaceId: l.storagePlaceId ?? null,
    storagePlaceName: l.storagePlaceName ?? null,
    frozen: l.frozen ?? false,
    frozenOn: l.frozenOn ?? null,
    toAnswer: l.toAnswer ?? false,
    plannedPortions: l.plannedPortions ?? 0,
  }
}

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
export function leftoverRows(leftovers: LeftoverLike[], today: string): LeftoverRow[] {
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
