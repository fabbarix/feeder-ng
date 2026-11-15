import type { ReactNode } from 'react'

export interface ImportReviewNoticeProps {
  /** Recipes the import will save (not skipped). */
  recipes: number
  /** Ingredients of the file (every row, exact matches included). */
  ingredients: number
  /** Open questions (lib/reviewSummary.openQuestions). */
  questions: number
  /** Every Recipe of the file is skipped. */
  allSkipped?: boolean
  onGoToFirst: () => void
}

/** B9-28 (RX-01): stub, not built yet. See ImportReviewNotice.test.tsx. */
export function ImportReviewNotice(_props: ImportReviewNoticeProps): ReactNode {
  return null
}
