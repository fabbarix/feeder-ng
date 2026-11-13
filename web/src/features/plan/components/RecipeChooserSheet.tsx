import { useState, type ReactNode } from 'react'
import { BottomSheet, ListGroup, ListRow, RecipeThumb, SearchField } from '../../../ui'
import { matchRecipes } from '../lib/choose'
import { planStrings as s } from '../strings'
import type { RecipeChoice } from '../types'
import { leftoverStrings } from '../../../lib/leftovers/copy'
import { freezerChoices } from '../../../lib/leftovers/rows'
import type { Leftover } from '../../../lib/leftovers/types'
import '../plan.css'

export interface RecipeChooserSheetProps {
  open: boolean
  onClose: () => void
  recipes: RecipeChoice[]
  isLoading: boolean
  onPick: (recipeId: number) => void
  /** B5-LOW: the frozen Leftovers (any Recipe; only those of the Recipes offered are listed). */
  frozenLeftovers?: Leftover[]
  /** B5-LOW: a frozen Leftover was chosen: the Planned Meal is pinned to it, not to its Recipe. */
  onPickLeftover?: (leftoverId: number) => void
}

/**
 * Bottom sheet listing every Recipe as a row with its thumb, searchable by name; choosing one sets (and pins) it on an empty slot.
 * B5-LOW: above the Recipes, "From the freezer" lists the frozen Leftovers of the Recipes offered (portions and Storage Place).
 */
export function RecipeChooserSheet({ open, onClose, recipes, isLoading, onPick, frozenLeftovers = [], onPickLeftover = () => {} }: RecipeChooserSheetProps): ReactNode {
  const [query, setQuery] = useState('')
  const shown = matchRecipes(recipes, query)
  const freezer = freezerChoices(frozenLeftovers, new Set(shown.map((r) => r.id)))
  return (
    <BottomSheet open={open} onClose={onClose} title={s.chooseTitle}>
      <div className="plan__stack">
        {isLoading ? <p className="plan__muted">{s.loading}</p> : null}
        {!isLoading && recipes.length === 0 ? <p className="plan__muted">{s.chooseNone}</p> : null}
        {!isLoading && recipes.length > 0 ? (
          <>
            <SearchField label={s.searchRecipes} value={query} onChange={setQuery} />
            {freezer.length > 0 ? (
              <ListGroup label={leftoverStrings.fromTheFreezer}>
                {freezer.map((c) => (
                  <ListRow key={c.leftoverId} title={c.recipeName} meta={c.meta} onActivate={() => onPickLeftover(c.leftoverId)} />
                ))}
              </ListGroup>
            ) : null}
            <ListGroup label={s.recipesList}>
              {shown.map((r) => (
                <ListRow
                  key={r.id}
                  title={r.name}
                  meta={r.totalMinutes ? s.minutes(r.totalMinutes) : undefined}
                  leading={<RecipeThumb name={r.name} photoUrl={r.imageUrl} tags={r.tags} size={48} initial={false} />}
                  onActivate={() => onPick(r.id)}
                />
              ))}
            </ListGroup>
          </>
        ) : null}
      </div>
    </BottomSheet>
  )
}
