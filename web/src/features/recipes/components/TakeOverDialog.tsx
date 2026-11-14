import type { ReactNode } from 'react'
import { Button, Dialog } from '../../../ui'
import { takeOverDialog } from '../../../lib/baseRecipes/takeOver'
import type { TakeOverAsk } from '../../../lib/baseRecipes/types'

export interface TakeOverDialogProps {
  /** null = closed. */
  ask: TakeOverAsk | null
  baseName: string
  onAnswer: (yes: boolean) => void
  /** Escape or backdrop: nothing is saved. */
  onCancel: () => void
}

/** BR-D: the take-over ask (ADR 0015 point 1). A Dialog built from takeOverDialog(): the Recipes and Stock named, "Yes" and "No" (Yes disabled with its reason when it cannot convert). */
export function TakeOverDialog({ ask, baseName, onAnswer, onCancel }: TakeOverDialogProps): ReactNode {
  if (!ask) return null
  const m = takeOverDialog(ask, baseName)
  return (
    <Dialog
      open
      onClose={onCancel}
      title={m.title}
      actions={
        <>
          <Button variant="tertiary" onClick={() => onAnswer(false)}>
            {m.noLabel}
          </Button>
          <Button variant="primary" disabled={m.yesDisabledReason !== undefined} onClick={() => onAnswer(true)}>
            {m.yesLabel}
          </Button>
        </>
      }
    >
      {m.body.map((paragraph, i) => (
        <p key={i}>{paragraph}</p>
      ))}
      {m.note ? <p>{m.note}</p> : null}
      {m.yesDisabledReason ?  <p className="line-row__hint">{m.yesDisabledReason}</p> : null}
    </Dialog>
  )
}
