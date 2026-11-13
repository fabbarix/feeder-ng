import type { ReactNode } from 'react'
import { Button, FormActions, StickyActionBar } from '../../../ui'
import { importStrings as s } from '../strings'

export interface ConfirmTileProps {
  canConfirm: boolean
  busy: boolean
  /** Things still to answer (reviewSteps open total). */
  open: number
  /** BR-E: the sentence that names what Confirm waits for (confirmNeedsAnswer); null when nothing does. */
  needs?: string | null
  onConfirm: () => void
}

/**
 * The Confirm bar of the review: a `StickyActionBar label="Import actions"` holding, when open > 0, importStrings.confirmOpen(open) and a
 * `FormActions` row with the Confirm button (importStrings.confirm; "Saving…" while busy), disabled unless canConfirm. Rendered after the review tiles.
 */
export function ConfirmTile({ canConfirm, busy, open, needs, onConfirm }: ConfirmTileProps): ReactNode {
  return (
    <StickyActionBar label={s.importActions}>
      {open > 0 ? <p className="import-confirm__open">{s.confirmOpen(open)}</p> : null}
      {needs ? <p className="import-confirm__open">{needs}</p> : null}
      <FormActions
        primary={
          <Button disabled={!canConfirm || busy} loading={busy} onClick={onConfirm}>
            {busy ? s.confirming : s.confirm}
          </Button>
        }
      />
    </StickyActionBar>
  )
}
