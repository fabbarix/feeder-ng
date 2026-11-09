import type { ReactNode } from 'react'
import type { PreferenceState } from '../types'

export interface PreferenceTogglesProps {
  state: PreferenceState
  onChange: (next: PreferenceState) => void
}

/**
 * Favourite / Dislike / Exclusion toggles for a Recipe (ui/Chip with `selected`, so each is a button
 * with aria-pressed). Tapping calls onChange(nextState(state, tapped)); only the active one is pressed.
 */
export function PreferenceToggles(_props: PreferenceTogglesProps): ReactNode {
  throw new Error('TODO')
}
