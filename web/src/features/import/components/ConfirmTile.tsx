import type { ReactNode } from 'react'
import { Button, Tile } from '../../../ui'
import { importStrings as s } from '../strings'

export interface ConfirmTileProps {
  canConfirm: boolean
  busy: boolean
  /** Things still to answer (reviewSteps open total). */
  open: number
  onConfirm: () => void
}

/** A wide Tile with the Confirm button (importStrings.confirm; "Saving…" while busy). Disabled unless canConfirm; when open > 0 says importStrings.confirmOpen(open). */
export function ConfirmTile({ canConfirm, busy, open, onConfirm }: ConfirmTileProps): ReactNode {
  return (
    <Tile size="wide" as="section">
      {open > 0 ? <p>{s.confirmOpen(open)}</p> : null}
      <Button size="lg" disabled={!canConfirm || busy} loading={busy} onClick={onConfirm}>
        {busy ? s.confirming : s.confirm}
      </Button>
    </Tile>
  )
}
