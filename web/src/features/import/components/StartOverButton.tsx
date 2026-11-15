import { useState, type ReactNode } from 'react'
import { Button, ConfirmDialog } from '../../../ui'
import { importStrings as s } from '../strings'

export interface StartOverButtonProps {
  /** An answer was given: Start over asks before discarding it. */
  answered: boolean
  onStartOver: () => void
}

const t = s.reviewRows

/**
 * The PageHeader's "Start over" while reviewing (RX-11). With no answer given it starts over at once; after an answer it asks first in our
 * own confirm dialog, with the copy of leaving a form with unsaved changes: Cancel "Keep answering" (focused), destructive "Discard answers".
 * The dialog is the ConfirmDialog that useConfirm mounts, held here so the screen needs no ConfirmProvider of its own.
 */
export function StartOverButton({ answered, onStartOver }: StartOverButtonProps): ReactNode {
  const [asking, setAsking] = useState(false)
  return (
    <>
      <Button variant="secondary" size="sm" icon="undo" onClick={() => (answered ? setAsking(true) : onStartOver())}>
        {s.startOver}
      </Button>
      {asking ? (
        <ConfirmDialog
          open
          title={t.discardTitle}
          cancelLabel={t.discardKeep}
          confirmLabel={t.discardConfirm}
          tone="danger"
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false)
            onStartOver()
          }}
        />
      ) : null}
    </>
  )
}
