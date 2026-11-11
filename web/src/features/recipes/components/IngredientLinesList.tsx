import type { ReactNode } from 'react'
import { displayName } from '../../ingredients/lib/names'
import type { UnitSystem } from '../../../lib/units'
import { quantityText } from '../lib/lineUnits'
import type { PreferenceMember } from '../lib/preferenceRows'
import { recipeStrings } from '../strings'
import type { IngredientRef, RecipeLine } from '../types'
import { IngredientExcluders } from './IngredientExcluders'

export interface IngredientLinesListProps {
  lines: RecipeLine[]
  /** Ingredients by id, for Base Units and Unit Conversions. */
  refs: ReadonlyMap<number, IngredientRef>
  system: UnitSystem
  /**
   * Who excludes each Ingredient: the Avatars of those Members and the "Exclusions for garlic" button that opens the
   * Who excludes garlic? Dialog. Omitted: nothing is drawn (rx-pt.md section 5.4).
   */
  excludedBy?: { members: (ingredientId: number) => PreferenceMember[]; onOpen: (ingredientId: number, ingredientName: string) => void }
}

/** The ingredient lines of a Recipe in the User's display system, as a two-column grid (quantity | name). */
export function IngredientLinesList({ lines, refs, system, excludedBy }: IngredientLinesListProps): ReactNode {
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
              {excludedBy ? (
                <IngredientExcluders
                  ingredient={name}
                  members={excludedBy.members(l.ingredientId)}
                  onOpen={() => excludedBy.onOpen(l.ingredientId, name)}
                />
              ) : null}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
