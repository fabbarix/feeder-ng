import type { ReactNode } from 'react'

export interface ConfirmTileProps {
  canConfirm: boolean
  busy: boolean
  /** Things still to answer (reviewSteps open total). */
  open: number
  onConfirm: () => void
}

/** A wide Tile with the Confirm button (importStrings.confirm; "Saving…" while busy). Disabled unless canConfirm; when open > 0 says importStrings.confirmOpen(open). */
export function ConfirmTile(props: ConfirmTileProps): ReactNode {
  void props
  throw new Error('not implemented')
}
