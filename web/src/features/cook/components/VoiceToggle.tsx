import type { ReactNode } from 'react'
import { Chip } from '../../../ui'
import { cookStrings } from '../strings'

export interface VoiceToggleProps {
  supported: boolean
  enabled: boolean
  onChange: (enabled: boolean) => void
}

/**
 * A `Chip` button (aria-pressed = enabled) labelled "Voice commands on" /
 * "Voice commands off". Where speech is unsupported it is disabled and the
 * label is "Voice commands are not available in this browser".
 */
export function VoiceToggle({ supported, enabled, onChange }: VoiceToggleProps): ReactNode {
  const label = !supported ? cookStrings.voiceUnsupported : enabled ? cookStrings.voiceOn : cookStrings.voiceOff
  return (
    <Chip selected={enabled} disabled={!supported} onClick={() => onChange(!enabled)}>
      {label}
    </Chip>
  )
}
