import type { ReactNode } from 'react'
import { IconButton } from '../../../ui'
import { displayName } from '../../ingredients/lib/names'
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

/** The ingredient lines of a Recipe in the User's display system, as a two-column grid (quantity | name), each with an Exclusion toggle when given. */
export function IngredientLinesList({ lines, refs, system, exclusions }: IngredientLinesListProps): ReactNode {
  return (
    <dl className="ingredient-lines">
      {lines.map((l, i) => {
        const name = l.ingredient ?? ''
        return (
          <div key={`${l.ingredientId}-${i}`} className="ingredient-lines__row">
            <dt className="ingredient-lines__quantity">{quantityText(l.quantity, l.unit, refs.get(l.ingredientId), system)}</dt>
            <dd className="ingredient-lines__name">
              <span>{displayName(name)}</span>
              {l.optional ? <span className="ingredient-lines__tag">{recipeStrings.optional}</span> : null}
              {l.note ? <span className="ingredient-lines__note">{l.note}</span> : null}
              {exclusions ? (
                <IconButton
                  icon="exclusion"
                  label={recipeStrings.excludeIngredient(name)}
                  pressed={exclusions.isExcluded(l.ingredientId)}
                  onClick={() => exclusions.onToggle(l.ingredientId)}
                />
              ) : null}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
