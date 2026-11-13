// pantry-filter: the List control of the Pantry header, "Storage Place · Ingredient" (shared Segmented, compact, a radiogroup
// "List" whose label is visually hidden; docs/design/pantry-filter.md 3, 7).
import type { ReactNode } from 'react'
import { Segmented } from '../../../ui'
import type { PantryMode } from '../lib/pantryFilters'
import { stockStrings as strings } from '../strings'

export interface PantryModeControlProps {
  value: PantryMode
  onChange: (mode: PantryMode) => void
}

export function PantryModeControl({ value, onChange }: PantryModeControlProps): ReactNode {
  return (
    <Segmented<PantryMode>
      label={strings.view.label}
      labelHidden
      compact
      value={value}
      onChange={onChange}
      options={[
        { value: 'places', label: strings.view.places },
        { value: 'ingredients', label: strings.view.ingredients },
      ]}
    />
  )
}
