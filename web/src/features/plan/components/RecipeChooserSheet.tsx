import type { ReactNode } from 'react'
import { BottomSheet, Button } from '../../../ui'
import { planStrings } from '../strings'
import type { RecipeChoice } from '../types'
import '../plan.css'

export interface RecipeChooserSheetProps {
  open: boolean
  onClose: () => void
  recipes: RecipeChoice[]
  isLoading: boolean
  onPick: (recipeId: number) => void
}

/** Bottom sheet listing every Recipe; choosing one sets (and pins) it on an empty slot. */
export function RecipeChooserSheet({ open, onClose, recipes, isLoading, onPick }: RecipeChooserSheetProps): ReactNode {
  return (
    <BottomSheet open={open} onClose={onClose} title={planStrings.chooseTitle}>
      <div className="plan__stack">
        {isLoading ? <p className="plan__muted">{planStrings.loading}</p> : null}
        {!isLoading && recipes.length === 0 ? <p className="plan__muted">{planStrings.chooseNone}</p> : null}
        {recipes.map((r) => (
          <Button key={r.id} variant="tonal" onClick={() => onPick(r.id)}>
            {r.name}
          </Button>
        ))}
      </div>
    </BottomSheet>
  )
}
