// B9-26 (PC-01): the Review of the last write's changes, shared by the toast, the Plan screen and the changed rows.
// TEST-AUTHOR STUB: the shape the tests pin; the developer replaces the body.
import { createContext } from 'react'
import type { PlanChange, ReplanKind, ReviewModel } from '../lib/replan'
import type { PlanActor } from '../lib/replan'

export interface ReplanReviewController {
  /** The "What changed" sheet is open. */
  open: boolean
  /** The sheet's content; null while there is nothing to review. */
  model: ReviewModel | null
  /** The marks on the changed rows by `markKey`: "was Lentil soup". Cleared when Review opens and when the Plan screen unmounts. */
  marks: Record<string, string>
  /** Whether "Undo all" is offered (the signed-in User's own write still holds its token). */
  canUndo: boolean
  busy: boolean
  openReview: () => void
  /** "Keep the changes" and Close: the sheet closes, the marks go, nothing is written. */
  keep: () => void
  /** "Undo all": POST /api/plan/restore with the token; resolves true when it was undone. A refusal is the refused-Undo toast. */
  undoAll: () => Promise<boolean>
}

/**
 * The marks of the changed rows by `markKey` ("was Lentil soup"). The Plan screen provides `review.marks`; PlanCourseRow reads it with
 * useContext (default: no marks), so no prop is passed down through the grid (DayTile, MealTile are B9-32's) and a row outside the
 * Plan screen needs no provider.
 */
export const ReplanMarksContext = createContext<Record<string, string>>({})

export type { PlanActor, PlanChange, ReplanKind }

export function useReplanReview(): ReplanReviewController {
  throw new Error('B9-26: hooks/useReplanReview.ts is not built yet')
}
