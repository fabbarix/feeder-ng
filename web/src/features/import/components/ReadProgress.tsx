import { useEffect, useRef, useState, type ReactNode } from 'react'
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

/**
 * The stage of a running read in one polite live region (shown once, with "Step n of N" beside it), "Still working…" after
 * 20 s, and Cancel. Takes focus when it appears, because the button that started the read is replaced by it.
 */
export function ReadProgress({ kind, state, elapsedSeconds, onCancel }: ReadProgressProps): ReactNode {
  const stages = stagesFor(kind)
  const current = state ?? stages[0]
  const at = current ? Math.max(stages.indexOf(current), 0) : 0
  const note = elapsedNote(elapsedSeconds)
  const stage = current ? stageCopy(current) : ''
  const group = useRef<HTMLDivElement>(null)
  // A live region announces changes, not its first content: it is rendered empty and filled after it is in the page.
  const [announced, setAnnounced] = useState('')
  useEffect(() => setAnnounced(stage), [stage])
  useEffect(() => group.current?.focus({ preventScroll: true }), [])
  return (
    <div ref={group} role="group" aria-label={t.progressLabel} tabIndex={-1} className="read-progress">
      <div role="progressbar" aria-label={t.progressLabel} className="read-progress__bar" />
      {/* The only live region: the stage text alone, so nothing else chatters. */}
      <p role="status" aria-live="polite" className="read-progress__stage">
        {announced}
      </p>
      <p className="read-progress__step">{t.stepOf(at + 1, stages.length)}</p>
      {note ? <p className="read-progress__note">{note}</p> : null}
      <Button variant="tertiary" onClick={onCancel}>
        {t.cancel}
      </Button>
    </div>
  )
}
