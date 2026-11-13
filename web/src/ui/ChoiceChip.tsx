// A tap-sized choice chip (44 px): a real button for picking one of a few answers in a sheet, such as "Which Line is it?" or a
// pack size (shop-scan-proposals.md 13.5). The small `Chip` (26 px) stays the meaning chip; this one is a control. Render only.
import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { Thumb } from './Thumb'
import './ChoiceChip.css'

export type ChoiceChipVariant = 'filled' | 'outline' | 'quiet'

export interface ChoiceChipProps {
  /** A toggle's state: renders aria-pressed. Leave it out for a chip that acts at once (it has no on/off). */
  pressed?: boolean
  /** A leading Picture (its monogram without one); wins over `icon`. */
  thumb?: { name: string; imageUrl?: string }
  /** A leading icon. */
  icon?: IconName
  /** A muted trailing note ("125 g", "Restock"). */
  note?: ReactNode
  /** filled (default): the surface-2 chip; outline: transparent with the outline; quiet: muted text */
  variant?: ChoiceChipVariant
  disabled?: boolean
  /** The accessible name, when it must say more than the text (start with the visible text). */
  label?: string
  onClick: () => void
  children: ReactNode
}

export function ChoiceChip({ pressed, thumb, icon, note, variant = 'filled', disabled, label, onClick, children }: ChoiceChipProps) {
  let lead: ReactNode = null
  if (thumb) lead = <Thumb name={thumb.name} imageUrl={thumb.imageUrl} size={40} />
  else if (icon) lead = <Icon name={icon} size={20} />
  return (
    <button type="button" className="choice-chip" data-variant={variant} aria-pressed={pressed} aria-label={label} disabled={disabled} onClick={onClick}>
      {lead ? (
        <span className="choice-chip__lead" aria-hidden="true">
          {lead}
        </span>
      ) : null}
      <span className="choice-chip__label">{children}</span>
      {/* The space keeps the accessible name readable ("Mozzarella 125 g"); a flex container drops it from the layout. */}
      {note !== undefined && note !== null && note !== '' ? (
        <>
          {' '}
          <span className="choice-chip__note">{note}</span>
        </>
      ) : null}
    </button>
  )
}
