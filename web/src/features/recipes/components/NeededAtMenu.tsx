import { useState, type ReactNode } from 'react'
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
  /** A Step index = override; null = back to the default. */
  onChange: (step: number | null) => void
}

/** BR-D: the Needed at chip-menu of a Base recipe line: a Menu whose trigger reads "Needed at Step 4" / "Before you start" and lists neededAtOptions. */
export function NeededAtMenu({ steps, value, defaultStep, lineName, onChange }: NeededAtMenuProps): ReactNode {
  const [open, setOpen] = useState(false)
  const options = neededAtOptions(steps, defaultStep)
  const label = neededAtLabel(steps, value)
  return (
    <div className="needed-at">
      <button
        type="button"
        className="needed-at__trigger chip chip--tag"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label} for ${lineName}`}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open ? (
        <ul role="menu" className="needed-at__menu" aria-label={recipeStrings.baseRecipe.neededAt}>
          {options.map((o) => (
            <li key={o.value ?? 'default'}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={o.value === value}
                className="needed-at__item"
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
