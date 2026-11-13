// The ask-before-waste row: "Chilli was to be used by Tue. Had it, threw it out, or wasn't there?". Presentational.
import { leftoverStrings, questionText } from '../../lib/leftovers/copy'
import type { Leftover, LeftoverAnswer } from '../../lib/leftovers'
import { Button } from '../Button'
import { Icon } from '../Icon'
import './LeftoverActions.css'

export interface LeftoverQuestionProps {
  leftover: Leftover
  today: string
  /** Disables the three buttons while an answer is saved. */
  busy?: boolean
  onAnswer: (answer: LeftoverAnswer, leftover: Leftover) => void
}

export function LeftoverQuestion({ leftover, today, busy = false, onAnswer }: LeftoverQuestionProps) {
  return (
    <div className="leftover-question" data-testid={`leftover-question-${leftover.id}`} data-tone="info">
      <Icon name="question" size={20} />
      <p className="leftover-question__text">{questionText(leftover.recipeName, leftover.useBy, today)}</p>
      <div className="leftover-question__answers">
        <Button variant="secondary" disabled={busy} onClick={() => onAnswer('had_it', leftover)}>
          {leftoverStrings.hadIt}
        </Button>
        <Button variant="danger-tertiary" disabled={busy} onClick={() => onAnswer('threw_out', leftover)}>
          {leftoverStrings.threwOut}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => onAnswer('wasnt_there', leftover)}>
          {leftoverStrings.wasntThere}
        </Button>
      </div>
    </div>
  )
}
