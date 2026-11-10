import { Chip } from './Chip'
import { whyIcon, type WhyCause } from './lib/whyIcon'

export interface WhyChipProps {
  /** The planner's reason, shown as the chip text. */
  reason: string
  /** Picks the icon (lib/whyIcon); default `why`. */
  cause?: WhyCause
  onClick?: () => void
}

/** A `why` Chip that explains a planner decision. */
export function WhyChip({ reason, cause, onClick }: WhyChipProps) {
  return (
    <Chip kind="why" icon={whyIcon(cause)} onClick={onClick}>
      {reason}
    </Chip>
  )
}
