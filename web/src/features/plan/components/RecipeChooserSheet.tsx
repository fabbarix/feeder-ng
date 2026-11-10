import { useState, type ReactNode } from 'react'
import { BottomSheet, ListGroup, ListRow, RecipeThumb, SearchField } from '../../../ui'
import { matchRecipes } from '../lib/choose'
import { planStrings as s } from '../strings'
import type { RecipeChoice } from '../types'
import '../plan.css'

export interface RecipeChooserSheetProps {
  open: boolean
  onClose: () => void
  recipes: RecipeChoice[]
  isLoading: boolean
  onPick: (recipeId: number) => void
}

/** Bottom sheet listing every Recipe as a row with its thumb, searchable by name; choosing one sets (and pins) it on an empty slot. */
export function RecipeChooserSheet({ open, onClose, recipes, isLoading, onPick }: RecipeChooserSheetProps): ReactNode {
  const [query, setQuery] = useState('')
  const shown = matchRecipes(recipes, query)
  return (
    <BottomSheet open={open} onClose={onClose} title={s.chooseTitle}>
      <div className="plan__stack">
        {isLoading ? <p className="plan__muted">{s.loading}</p> : null}
        {!isLoading && recipes.length === 0 ? <p className="plan__muted">{s.chooseNone}</p> : null}
        {!isLoading && recipes.length > 0 ? (
          <>
            <SearchField label={s.searchRecipes} value={query} onChange={setQuery} />
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
