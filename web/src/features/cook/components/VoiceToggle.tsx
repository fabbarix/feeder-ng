import type { ReactNode } from 'react'
import { IconButton } from '../../../ui'
import { cookStrings } from '../strings'

export interface VoiceToggleProps {
  supported: boolean
  enabled: boolean
  onChange: (enabled: boolean) => void
}

/**
 * A pressed `IconButton` (microphone; microphone-slash while off) with ONE stable name, "Voice commands"; aria-pressed
 * carries on/off. Where speech is unsupported it is disabled, keeps the same name and gets the explanation as its
 * description (title), never a changed name.
 */
export function VoiceToggle({ supported, enabled, onChange }: VoiceToggleProps): ReactNode {
  return (
    <IconButton
      icon={enabled ? 'voice' : 'voiceOff'}
      label={cookStrings.voice}
      pressed={enabled}
      disabled={!supported}
      title={supported ? undefined : cookStrings.voiceUnsupported}
      onClick={() => onChange(!enabled)}
    />
  )
}
