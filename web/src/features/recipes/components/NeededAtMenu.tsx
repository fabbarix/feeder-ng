import type { ReactNode } from 'react'
import { Menu, type MenuItem } from '../../../ui'
import { neededAtLabel, neededAtOptions } from '../lib/baseRecipe'
import { recipeStrings } from '../strings'
import type { RecipeStep } from '../types'

export interface NeededAtMenuProps {
  steps: ReadonlyArray<Pick<RecipeStep, 'text' | 'kind'>>
  /** The Step that applies now (the override or the default), 0-based. */
  value: number
  /** The default Step, marked "(default)"; null = unknown (no mark). */
  defaultStep: number | null
  /** The Base recipe line's name, for the accessible name. */
  lineName: string
  /** A Step index = override; null = back to the default (choosing "(default)" sends null). */
  onChange: (step: number | null) => void
}

/** BR-D: the Needed at chip-menu of a Base recipe line, on the shared Menu: the chip reads "Needed at Step 4" / "Before you start"; the menu lists the non-Advance Steps. */
export function NeededAtMenu({ steps, value, defaultStep, lineName, onChange }: NeededAtMenuProps): ReactNode {
  const options = neededAtOptions(steps, defaultStep)
  const items: MenuItem[] = options.map((o) => ({
    id: `step-${o.value ?? 'none'}`,
    label: o.label,
    checked: o.value === value,
    onSelect: () => onChange(o.value === defaultStep ? null : o.value),
  }))
  const current = options.find((o) => o.value === value)
  return (
    <Menu
      label={`${neededAtLabel(steps, value)} for ${lineName}`}
      title={recipeStrings.baseRecipe.neededAt}
      items={items}
      trigger={neededAtLabel(steps, value)}
      initialFocusId={current ? `step-${current.value ?? 'none'}` : undefined}
    />
  )
}
