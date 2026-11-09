import { Chip } from './Chip'

export interface WhyChipProps {
  /** The planner's reason, shown as the chip text. */
  reason: string
  onClick?: () => void
}

/** A Chip that explains a planner decision. */
export function WhyChip({ reason, onClick }: WhyChipProps) {
  return (
    <Chip tone="accent" data-kind="why" onClick={onClick}>
      {reason}
    </Chip>
  )
}
