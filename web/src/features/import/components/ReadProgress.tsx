import type { ReactNode } from 'react'
import { Button } from '../../../ui'
import { elapsedNote, stageCopy, stagesFor } from '../lib/readProgress'
import { readStrings as t } from '../strings'
import type { ReadInput, ReadState } from '../types'

export interface ReadProgressProps {
  kind: ReadInput['kind']
  state: ReadState | undefined
  elapsedSeconds: number
  onCancel: () => void
}

/** The stage of a running read in one polite live region, the stages as a list, "Still working…" after 20 s, and Cancel. */
export function ReadProgress({ kind, state, elapsedSeconds, onCancel }: ReadProgressProps): ReactNode {
  const stages = stagesFor(kind)
  const current = state ?? stages[0]
  const at = current ? stages.indexOf(current) : -1
  const note = elapsedNote(elapsedSeconds)
  return (
    <div className="read-progress">
      <div role="progressbar" aria-label={t.progressLabel} className="read-progress__bar" />
      {/* The only live region: the stage text alone, so nothing else chatters. */}
      <p role="status" aria-live="polite" className="read-progress__stage">
        {current ? stageCopy(current) : ''}
      </p>
      <ol aria-label={t.steps} className="read-progress__steps">
        {stages.map((stage, i) => (
          <li key={stage} aria-current={i === at ? 'step' : undefined} data-done={i < at || undefined}>
            {stageCopy(stage)}
          </li>
        ))}
      </ol>
      {note ? <p className="read-progress__note">{note}</p> : null}
      <Button variant="tertiary" onClick={onCancel}>
        {t.cancel}
      </Button>
    </div>
  )
}
