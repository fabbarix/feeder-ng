import type { ReactNode } from 'react'
import { BottomSheet, Button, ListGroup, ListRow, RecipeThumb } from '../../../ui'
import { usePhraseContext } from '../hooks/usePhraseContext'
import { alternativeNote, swapMeta } from '../lib/choose'
import { planStrings as s } from '../strings'
import type { Alternative, PlanSlot } from '../types'
import '../plan.css'

export interface SwapSheetProps {
  open: boolean
  onClose: () => void
  /** The slot being swapped (its date words the why chips). */
  slot: PlanSlot | null
  alternatives: Alternative[]
  isLoading: boolean
  onPick: (recipeId: number) => void
}

/** Bottom sheet with the top 3 alternatives as rows (thumb, Recipe, first reason and the Leftover); a tap swaps and pins. */
export function SwapSheet({ open, onClose, slot, alternatives, isLoading, onPick }: SwapSheetProps): ReactNode {
  const slotDate = slot?.date ?? ''
  const phrase = usePhraseContext(slotDate)
  const rows = alternatives.slice(0, 3)
  return (
    <BottomSheet open={open} onClose={onClose} title={s.swapTitle} footer={<Button variant="tertiary" onClick={onClose}>{s.swapKeep}</Button>}>
      <div className="plan__stack">
        {isLoading ? <p className="plan__muted">{s.swapLoading}</p> : null}
        {!isLoading && rows.length === 0 ? <p className="plan__muted">{s.swapNone}</p> : null}
        {rows.length > 0 ? (
          <ListGroup label={s.swapAlternatives}>
            {rows.map((a) => (
              <ListRow
                key={a.recipeId}
                title={a.recipeName}
                meta={swapMeta(alternativeNote(a, phrase), a.newLeftoverPortions > 0 ? s.extraPortions(a.newLeftoverPortions) : '')}
                leading={<RecipeThumb name={a.recipeName} photoUrl={a.photoUrl} size={48} initial={false} />}
                onActivate={() => onPick(a.recipeId)}
              />
            ))}
          </ListGroup>
        ) : null}
      </div>
    </BottomSheet>
  )
}
