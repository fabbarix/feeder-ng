import type { ReactNode } from 'react'
import { Chip } from '../../../ui'
import type { UnitSystem } from '../../../lib/units'
import { quantityText } from '../lib/lineUnits'
import { recipeStrings } from '../strings'
import type { IngredientRef, RecipeLine } from '../types'

export interface IngredientLinesListProps {
  lines: RecipeLine[]
  /** Ingredients by id, for Base Units and Unit Conversions. */
  refs: ReadonlyMap<number, IngredientRef>
  system: UnitSystem
  /** Ingredient Exclusion of the chosen Member; omitted to hide the toggles. */
  exclusions?: { isExcluded: (ingredientId: number) => boolean; onToggle: (ingredientId: number) => void }
}

/** The ingredient lines of a Recipe in the User's display system, each with an Exclusion toggle when given. */
export function IngredientLinesList({ lines, refs, system, exclusions }: IngredientLinesListProps): ReactNode {
  return (
    <ul>
      {lines.map((l, i) => (
        <li key={`${l.ingredientId}-${i}`}>
          <span>{quantityText(l.quantity, l.unit, refs.get(l.ingredientId), system)}</span> <span>{l.ingredient}</span>
          {l.optional ? <span> ({recipeStrings.optional})</span> : null}
          {l.note ? <span> {l.note}</span> : null}
          {exclusions ? (
            <Chip
              tone="spoil"
              selected={exclusions.isExcluded(l.ingredientId)}
              onClick={() => exclusions.onToggle(l.ingredientId)}
            >
              {recipeStrings.excludeIngredient(l.ingredient ?? '')}
            </Chip>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
