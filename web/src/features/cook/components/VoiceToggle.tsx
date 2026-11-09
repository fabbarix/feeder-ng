import type { ReactNode } from 'react'

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
export function VoiceToggle(_props: VoiceToggleProps): ReactNode {
  return null
}
