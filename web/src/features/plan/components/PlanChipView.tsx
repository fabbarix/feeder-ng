import { Chip } from '../../../ui'
import { BOUGHT_CHIP_KEY } from '../lib/bought'
import type { PlanChip } from '../lib/chips'
import { BoughtChip } from './BoughtChip'

/** One PlanChip as a Chip: the Bought chip carries its cart glyph (BoughtChip); every other chip is plain. */
export function PlanChipView({ chip }: { chip: PlanChip }) {
  if (chip.key === BOUGHT_CHIP_KEY) return <BoughtChip />
  return (
    <Chip kind={chip.kind} status={chip.status}>
      {chip.label}
    </Chip>
  )
}
