import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { displayName } from '../../ingredients/lib/names'
import { Menu, type MenuItem } from '../../../ui'
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
  /** BR-D: "Link to a Base recipe" in a plain line's actions menu (the detail saves at once). Without it the item is absent. */
  onLinkToBase?: (line: RecipeLine) => void
  /** BR-D: "Use as a plain Ingredient" in a Base recipe line's actions menu. */
  onUseAsPlain?: (line: RecipeLine) => void
  excludedBy?: { members: (ingredientId: number) => PreferenceMember[]; onOpen: (ingredientId: number, ingredientName: string) => void }
}

/** The ingredient lines of a Recipe in the User's display system, as a two-column grid (quantity | name). */
export function IngredientLinesList({ lines, refs, system, excludedBy, onLinkToBase, onUseAsPlain }: IngredientLinesListProps): ReactNode {
  return (
    <dl className="ingredient-lines">
      {lines.map((l, i) => {
        const name = l.ingredient ?? ''
        const base = l.baseRecipe ?? null
        const actions = lineActions(l, onLinkToBase, onUseAsPlain)
        return (
          <div key={`${l.ingredientId}-${i}`} className="ingredient-lines__row">
            {base ? null : <dt className="ingredient-lines__quantity">{quantityText(l.quantity, l.unit, refs.get(l.ingredientId), system)}</dt>}
            <dd className="ingredient-lines__name">
              {base ? (
                <BaseName
                  id={base.id}
                  label={`${quantityText(l.quantity, l.unit, refs.get(l.ingredientId), system)} ${displayName(name)}`}
                  archived={base.archived}
                  empty={base.empty}
                />
              ) : (
                <span>{displayName(name)}</span>
              )}
              {l.optional ? <span className="ingredient-lines__tag">{recipeStrings.optional}</span> : null}
              {l.note ? <span className="ingredient-lines__note">{l.note}</span> : null}
              {excludedBy ? (
                <IngredientExcluders
                  ingredient={name}
                  members={excludedBy.members(l.ingredientId)}
                  onOpen={() => excludedBy.onOpen(l.ingredientId, name)}
                />
              ) : null}
              {actions.length > 0 ? <Menu label={recipeStrings.lines.actions(name)} items={actions} /> : null}
            </dd>
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
 * BR-D: "500 ml Béchamel (Base recipe)" as one line, the whole line a link to the Base recipe, named by its text; archived and empty ones say so.
 * The quantity column is empty on a Base recipe line: the line reads as one sentence.
 */
function BaseName({ id, label, archived, empty }: { id: number; label: string; archived: boolean; empty?: boolean }): ReactNode {
  const t = recipeStrings.baseRecipe
  return (
    <>
      <Link to={`/recipes/${id}`}>
        {`${label} (${archived ? t.archivedLabel : t.badge})`}
      </Link>
      {empty ? <span className="ingredient-lines__note">{t.noIngredients}</span> : null}
    </>
  )
}
