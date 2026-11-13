import type { Leftover as LeftoverLike, PlanSlot } from '../types'
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

/**
 * The Leftovers a Planned Meal in this view is served from. "Leftovers to use" leaves them out (the meal's own link shows them),
 * except a question: one past its Use-by is still asked until it is answered.
 */
export function servedLeftoverIds(slots: PlanSlot[]): Set<number> {
  const ids = new Set<number>()
  for (const slot of slots) {
    for (const course of slot.courses ?? []) {
      const id = course.meal?.servedFromLeftover?.leftoverId
      if (id !== null && id !== undefined) ids.add(id)
    }
  }
  return ids
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
