import type { ReactNode } from 'react'
import { Chip } from '../../../ui'
import { nextState } from '../lib/preference'
import { recipeStrings } from '../strings'
import type { PreferenceState } from '../types'

export interface PreferenceTogglesProps {
  state: PreferenceState
  onChange: (next: PreferenceState) => void
  /** True until a Member is chosen: every toggle is disabled. */
  disabled?: boolean
}

const options = [
  { state: 'favourite', label: recipeStrings.favourite },
  { state: 'dislike', label: recipeStrings.dislike },
  { state: 'exclusion', label: recipeStrings.exclusion },
] as const

/**
 * Favourite / Dislike / Exclusion toggles for a Recipe (ui/Chip with `selected`, so each is a button
 * with aria-pressed). Tapping calls onChange(nextState(state, tapped)); only the active one is pressed.
 */
export function PreferenceToggles({ state, onChange }: PreferenceTogglesProps): ReactNode {
  return (
    <div role="group" aria-label={recipeStrings.preferences}>
      {options.map((o) => (
        <Chip
          key={o.state}
          tone={o.state === 'exclusion' ? 'spoil' : 'accent'}
          selected={state === o.state}
          onClick={() => onChange(nextState(state, o.state))}
        >
          {o.label}
        </Chip>
      ))}
    </div>
  )
}
