import type { ReactNode } from 'react'
import { BottomSheet, Icon, ListGroup, ListRow, RecipeThumb } from '../../../ui'
import { usePhraseContext } from '../hooks/usePhraseContext'
import { alternativeChips, chooserContext, reasonChips, sheetCourse } from '../lib/choose'
import { SheetRowChips } from './SheetRowChips'
import { swapBoughtNote, type BoughtInfo } from '../lib/bought'
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
  /** B5-BOW: the swapped meal's Bought info; when Bought the sheet notes what stays in Stock (lib/bought swapBoughtNote). */
  bought?: BoughtInfo | null
  /** B9-38 (PC-10): the Course being swapped (absent = the main Course): its Recipe is "Now" and the context line names it. */
  courseId?: number
}

/**
 * B9-38 (PC-10): the Swap sheet. The context line names the day, Meal Slot and Course ("Tue 17 · Breakfast · Main"), the title
 * the Recipe being swapped. "Now" is the current Recipe (a plain row), "Instead" the top 3 alternatives: a neutral monogram, the
 * why chips under the text, the Leftover it would leave in the value column; a tap swaps and pins. "Keep it" is the footer's
 * Cancel, so there is no Close.
 */
export function SwapSheet({ open, onClose, slot, alternatives, isLoading, onPick, bought, courseId }: SwapSheetProps): ReactNode {
  const slotDate = slot?.date ?? ''
  const phrase = usePhraseContext(slotDate)
  const rows = alternatives.slice(0, 3)
  const boughtNote = swapBoughtNote(bought)
  const course = slot ? sheetCourse(slot, courseId) : undefined
  const meal = course?.meal ?? null
  const nowChips = meal ? reasonChips(meal.why, phrase) : []
  const thumb = (name: string, photoUrl?: string) => <RecipeThumb name={name} photoUrl={photoUrl} size={48} tone="neutral" />
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onCancel={onClose}
      cancelLabel={s.swapKeep}
      context={slot ? chooserContext(slot, courseId) : undefined}
      title={meal ? s.swapTitle(meal.recipeName) : s.swap}
    >
      <div className="plan__stack plan-sheet__rows">
        {meal ? (
          <section className="plan-sheet__group">
            <p className="plan-sheet__label" aria-hidden="true">
              {s.swapNow}
            </p>
            <ListGroup label={s.swapNow}>
              <ListRow title={meal.recipeName} leading={thumb(meal.recipeName, meal.photoUrl)} below={nowChips.length > 0 ? <SheetRowChips chips={nowChips} /> : undefined} />
            </ListGroup>
          </section>
        ) : null}
        {boughtNote ? <p className="plan__muted">{boughtNote}</p> : null}
        {isLoading ? <p className="plan__muted">{s.swapLoading}</p> : null}
        {!isLoading && rows.length === 0 ? <p className="plan__muted">{s.swapNone}</p> : null}
        {rows.length > 0 ? (
          <section className="plan-sheet__group">
            <p className="plan-sheet__label" aria-hidden="true">
              {s.swapInstead}
            </p>
            <ListGroup label={s.swapInstead}>
              {rows.map((a) => {
                const chips = alternativeChips(a, phrase)
                return (
                  <ListRow
                    key={a.recipeId}
                    title={a.recipeName}
                    leading={thumb(a.recipeName, a.photoUrl)}
                    value={a.newLeftoverPortions > 0 ? s.leftoverGain(a.newLeftoverPortions) : undefined}
                    below={chips.length > 0 ? <SheetRowChips chips={chips} /> : undefined}
                    onActivate={() => onPick(a.recipeId)}
                  />
                )
              })}
            </ListGroup>
          </section>
        ) : null}
        <p className="plan-sheet__note">
          <Icon name="info" size={16} />
          <span>{s.swapNote}</span>
        </p>
      </div>
    </BottomSheet>
  )
}
