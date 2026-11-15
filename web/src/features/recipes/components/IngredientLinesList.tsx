import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { displayName } from '../../ingredients/lib/names'
import { Menu, type MenuItem } from '../../../ui'
import type { UnitSystem } from '../../../lib/units'
import { lineDetail } from '../lib/lineDetail'
import { quantityText } from '../lib/lineUnits'
import { recipeStrings } from '../strings'
import type { IngredientRef, RecipeLine } from '../types'

export interface IngredientLinesListProps {
  lines: RecipeLine[]
  /** Ingredients by id, for Base Units and Unit Conversions. */
  refs: ReadonlyMap<number, IngredientRef>
  system: UnitSystem
  /** BR-D: "Link to a Base recipe" in a plain line's actions menu (the detail saves at once). Without it the item is absent. */
  onLinkToBase?: (line: RecipeLine) => void
  /** BR-D: "Use as a plain Ingredient" in a Base recipe line's actions menu. */
  onUseAsPlain?: (line: RecipeLine) => void
}

/**
 * RX-04 and RX-14: the ingredient lines of a Recipe as R-E rows in the User's display system: the name (dt, the key), the quantity at the
 * end (dd, tabular), the outlined ⋮ last (dd, only when the line has actions; the CSS keeps its track so the quantities line up), and the
 * muted detail under them ("Optional · crushed"). A Base recipe line reads as one link ("500 ml Béchamel (Base recipe)") and has no
 * separate quantity.
 */
export function IngredientLinesList({ lines, refs, system, onLinkToBase, onUseAsPlain }: IngredientLinesListProps): ReactNode {
  return (
    <dl className="ingredient-lines">
      {lines.map((l, i) => {
        const name = l.ingredient ?? ''
        const base = l.baseRecipe ?? null
        const actions = lineActions(l, onLinkToBase, onUseAsPlain)
        const quantity = quantityText(l.quantity, l.unit, refs.get(l.ingredientId), system)
        const detail = lineDetail(l)
        return (
          <div key={`${l.ingredientId}-${i}`} className="ingredient-lines__row">
            <dt className={base ? 'ingredient-lines__name ingredient-lines__name--base' : 'ingredient-lines__name'}>
              {base ? <BaseName id={base.id} label={`${quantity} ${displayName(name)}`} archived={base.archived} /> : displayName(name)}
            </dt>
            {base ? null : <dd className="ingredient-lines__quantity">{quantity}</dd>}
            {actions.length > 0 ? (
              <dd className="ingredient-lines__actions">
                <Menu label={recipeStrings.lines.actions(name)} items={actions} />
              </dd>
            ) : null}
            {detail ? <dd className="ingredient-lines__detail">{detail}</dd> : null}
          </div>
        )
      })}
    </dl>
  )
}

/** BR-D: the line's actions: "Link to a Base recipe" on a plain line, "Use as a plain Ingredient" on a Base recipe line (only with the callbacks). */
function lineActions(l: RecipeLine, onLinkToBase?: (line: RecipeLine) => void, onUseAsPlain?: (line: RecipeLine) => void): MenuItem[] {
  const isBase = (l.baseRecipe ?? null) !== null
  if (!isBase && onLinkToBase && l.ingredientId) {
    return [{ id: 'link', label: recipeStrings.baseRecipe.linkAction, icon: 'cook', onSelect: () => onLinkToBase(l) }]
  }
  if (isBase && onUseAsPlain) {
    return [{ id: 'plain', label: recipeStrings.baseRecipe.plainAction, icon: 'cook', onSelect: () => onUseAsPlain(l) }]
  }
  return []
}

/**
 * BR-D: "500 ml Béchamel (Base recipe)" as one line, the whole line a link to the Base recipe, named by its text; an archived one says so
 * (an empty one says it in the line's detail). A Base recipe line has no quantity cell: the line reads as one sentence.
 */
function BaseName({ id, label, archived }: { id: number; label: string; archived: boolean }): ReactNode {
  const t = recipeStrings.baseRecipe
  return <Link to={`/recipes/${id}`}>{`${label} (${archived ? t.archivedLabel : t.badge})`}</Link>
}
