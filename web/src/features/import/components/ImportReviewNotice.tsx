import type { ReactNode } from 'react'
import { Button, Icon, Tile } from '../../../ui'
import { importStrings as s } from '../strings'

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

const t = s.reviewRows

/**
 * B9-28 (RX-01): the notice at the top of Import Review, a status. With questions open it is info-toned and offers "Go to the first
 * question"; with none it says the import is ready (success); with every Recipe skipped it says so.
 */
export function ImportReviewNotice({ recipes, ingredients, questions, allSkipped, onGoToFirst }: ImportReviewNoticeProps): ReactNode {
  const open = questions > 0
  const counts = t.noticeCounts(recipes, ingredients)
  return (
    <Tile as="section" variant="status" status={open ? 'info' : 'success'} className="import-notice" role="status">
      <p className="import-notice__text">
        <Icon name={open ? 'info' : 'success'} size={20} />
        <span>
          {allSkipped ? (
            t.allSkipped
          ) : open ? (
            <>
              {counts}. <strong>{t.questionsToAnswer(questions)}</strong> {t.beforeImporting}
            </>
          ) : (
            `${counts}, ${t.readyToImport}`
          )}
        </span>
      </p>
      {open && !allSkipped ? (
        <Button variant="secondary" size="sm" icon="moveDown" onClick={onGoToFirst}>
          {t.goToFirst}
        </Button>
      ) : null}
    </Tile>
  )
}
