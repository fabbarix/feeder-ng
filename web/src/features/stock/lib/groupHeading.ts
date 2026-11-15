// B9-29 (SSP-03): the visible heading of a Pantry Storage Place group: its name, the decorative kind icon, the round count and the
// words of that count for assistive technology. Plain TypeScript, no React.
import type { IconName } from '../../../ui/icons'
import { KIND_ICON } from './kinds'
import { UNSORTED } from './pantry'
import type { PantrySection } from './pantryLeftovers'
import { stockStrings as strings } from '../strings'
import type { StoragePlace } from '../types'

export interface GroupHeading {
  title: string
  icon: IconName
  count: number
  /** "2 Stock Lots", or "1 Leftover" for a group that holds only frozen Leftovers. */
  countLabel: (n: number) => string
  /** Not sorted: the group Put away empties. */
  unsorted: boolean
}

/** The icon of Not sorted: no kind, since it is no place. */
export const UNSORTED_ICON: IconName = 'question'

export function groupHeading(section: PantrySection, places: readonly StoragePlace[]): GroupHeading {
  const unsorted = section.key === UNSORTED
  const place = unsorted ? undefined : places.find((p) => p.id === section.key)
  const onlyLeftovers = section.lots.length === 0 && section.leftovers.length > 0
  return {
    title: unsorted ? strings.unsorted : section.name,
    icon: place ? KIND_ICON[place.kind] : UNSORTED_ICON,
    count: onlyLeftovers ? section.leftovers.length : section.lots.length,
    countLabel: onlyLeftovers ? strings.leftoverCount : strings.lotCount,
    unsorted,
  }
}
