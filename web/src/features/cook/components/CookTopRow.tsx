import type { ReactNode } from 'react'

export interface CookTopRowProps {
  /** Step number and count of the cooking sequence (Advance Steps excluded), shown as the pill "Step 1 of 5". */
  number: number
  of: number
  speechSupported: boolean
  voiceOn: boolean
  onVoiceChange: (on: boolean) => void
  onExit: () => void
}

/**
 * The top row of Cook Mode (docs/design/ui-fix-plan.md 2.7): a secondary 44 px `Button` "Exit" with the X icon
 * (onExit), the "Step n of N" pill (a `Chip` kind state, role status so a Step change is announced), and the
 * voice `VoiceToggle` IconButton at the end. With no Steps (number 0) the pill is left out. Renders only.
 */
export function CookTopRow(props: CookTopRowProps): ReactNode {
  void props
  return null
}
