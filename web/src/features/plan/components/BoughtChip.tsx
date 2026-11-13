import { Chip } from '../../../ui'
import { boughtStrings as b } from '../boughtStrings'

/** The neutral Bought chip (a 'why' chip with a decorative shopping-cart glyph). */
export function BoughtChip() {
  return (
    <Chip kind="why" icon="shoppingCart">
      {b.chip}
    </Chip>
  )
}
