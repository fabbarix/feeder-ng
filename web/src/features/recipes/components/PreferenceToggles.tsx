import type { ReactNode } from 'react'
import { Chip } from '../../../ui'
import type { IconName } from '../../../ui/icons'
import { nextState } from '../lib/preference'
import { recipeStrings } from '../strings'
import type { PreferenceState } from '../types'

export interface PreferenceTogglesProps {
  state: PreferenceState
  onChange: (next: PreferenceState) => void
  /** True until a Member is chosen: every toggle is disabled. */
  disabled?: boolean
}

const options: { state: Exclude<PreferenceState, 'none'>; label: string; icon: IconName }[] = [
  { state: 'favourite', label: recipeStrings.favourite, icon: 'favourite' },
  { state: 'dislike', label: recipeStrings.dislike, icon: 'dislike' },
  { state: 'exclusion', label: recipeStrings.exclusion, icon: 'exclusion' },
]

/**
 * Favourite / Dislike / Exclusion for a Recipe as filter Chips with an icon each (aria-pressed). Tapping calls
 * onChange(nextState(state, tapped)): tapping the pressed one clears it.
 */
export function PreferenceToggles({ state, onChange, disabled }: PreferenceTogglesProps): ReactNode {
  return (
    <div role="group" aria-label={recipeStrings.preferences} className="preference-toggles">
      {options.map((o) => (
        <Chip
          key={o.state}
          kind="filter"
          icon={o.icon}
          selected={state === o.state}
          disabled={disabled}
          onClick={() => onChange(nextState(state, o.state))}
        >
          {o.label}
        </Chip>
      ))}
    </div>
  )
}
