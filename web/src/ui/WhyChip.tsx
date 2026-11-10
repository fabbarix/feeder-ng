import { Chip } from './Chip'
import type { WhyCause } from './lib/whyIcon'

export interface WhyChipProps {
  /** The planner's reason, shown as the chip text. */
  reason: string
  /** Picks the icon (lib/whyIcon); default `why`. */
  cause?: WhyCause
  onClick?: () => void
}

/** STUB (WP3 designer, existing implementation retained). A `why` Chip that explains a planner decision. */
export function WhyChip({ reason, onClick }: WhyChipProps) {
  return (
    <Chip tone="accent" data-kind="why" onClick={onClick}>
      {reason}
    </Chip>
  )
}
