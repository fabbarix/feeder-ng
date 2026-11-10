import type { ReactNode } from 'react'
import { Button, Chip } from '../../../ui'
import { cookStrings } from '../strings'
import { VoiceToggle } from './VoiceToggle'

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
export function CookTopRow({ number, of, speechSupported, voiceOn, onVoiceChange, onExit }: CookTopRowProps): ReactNode {
  return (
    <div className="cook-top">
      <Button variant="secondary" size="md" icon="exit" onClick={onExit}>
        {cookStrings.exit}
      </Button>
      {number > 0 ? (
        <span className="cook-top__step" role="status">
          <Chip kind="state" status="pinned" icon="cook">
            {cookStrings.stepOf(number, of)}
          </Chip>
        </span>
      ) : null}
      <VoiceToggle supported={speechSupported} enabled={voiceOn} onChange={onVoiceChange} />
    </div>
  )
}
