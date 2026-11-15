import { useEffect, useState, type ReactNode } from 'react'
import { Button, Icon, StickyActionBar } from '../../../ui'
import { importStrings as s } from '../strings'

export interface ImportBarProps {
  /** Recipes the import will save (not skipped). */
  recipes: number
  /** Open questions. */
  questions: number
  busy: boolean
  /** Moves focus to the first open question after the one that has focus (wraps around). */
  onNext: () => void
  onImport: () => void
}

const t = s.reviewRows

/**
 * B9-28 (RX-01): the sticky "Import actions" bar, one row at every width: the questions left, "Next question" (icon-only below 600 px, still
 * named) and the primary "Import N Recipes". The primary stays enabled with questions open: pressing it then goes to the next question
 * and says, as a status, how many are left (SAFE's field-error pattern). With nothing to import it reads "Nothing to import", disabled.
 */
export function ImportBar({ recipes, questions, busy, onNext, onImport }: ImportBarProps): ReactNode {
  const [asked, setAsked] = useState(false)
  useEffect(() => {
    if (questions === 0) setAsked(false)
  }, [questions])
  const nothing = recipes === 0
  const press = () => {
    if (questions > 0) {
      setAsked(true)
      onNext()
      return
    }
    onImport()
  }
  return (
    <StickyActionBar label={s.importActions}>
      <div className="import-bar">
        <p className="import-bar__meta" role="status">
          {asked && questions > 0 ? t.answerFirst(questions) : questions > 0 ? t.questionsLeft(questions) : null}
        </p>
        {questions > 0 ? (
          <Button variant="secondary" className="import-bar__next" onClick={onNext}>
            <Icon name="next" size={20} />
            <span className="import-bar__next-label">{t.nextQuestion}</span>
          </Button>
        ) : null}
        <Button disabled={nothing || busy} loading={busy} onClick={press}>
          {busy ? s.confirming : nothing ? t.nothingToImport : t.importN(recipes)}
        </Button>
      </div>
    </StickyActionBar>
  )
}
