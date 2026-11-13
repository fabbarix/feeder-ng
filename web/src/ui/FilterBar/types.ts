// The descriptor of one active filter chip of a filter header (docs/design/pantry-filter.md 5).
import type { ChipStatus } from '../Chip'
import type { IconName } from '../icons'

export interface FilterChip<K extends string = string> {
  /** Which filter the chip removes. */
  key: K
  label: string
  /** The accessible name of the chip's remove button ("Remove Tag: fish"). */
  removeLabel: string
  /** A Tag's colour id, when it has one (a `tag` chip). */
  tagColour?: string
  /** A status tone (Use soon, Spoiled, Leftovers): a `status` chip with that status's colours and icon. */
  status?: ChipStatus
  /** A leading icon (a Storage Place kind). */
  icon?: IconName
}
