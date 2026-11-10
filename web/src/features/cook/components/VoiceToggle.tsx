import type { ReactNode } from 'react'
import { IconButton } from '../../../ui'
import { cookStrings } from '../strings'

export interface VoiceToggleProps {
  supported: boolean
  enabled: boolean
  onChange: (enabled: boolean) => void
}

/**
 * A pressed `IconButton` (microphone; microphone-slash while off), aria-pressed = enabled, labelled "Voice commands
 * on" / "Voice commands off". Where speech is unsupported it is disabled and the label is "Voice commands are not
 * available in this browser".
 */
export function VoiceToggle({ supported, enabled, onChange }: VoiceToggleProps): ReactNode {
  const label = !supported ? cookStrings.voiceUnsupported : enabled ? cookStrings.voiceOn : cookStrings.voiceOff
  return (
    <IconButton
      icon={enabled ? 'voice' : 'voiceOff'}
      label={label}
      pressed={enabled}
      disabled={!supported}
      onClick={() => onChange(!enabled)}
    />
  )
}
