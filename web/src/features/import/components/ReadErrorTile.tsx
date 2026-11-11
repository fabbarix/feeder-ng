import type { ReactNode } from 'react'
import type { ReadErrorInput } from '../lib/readErrors'

export interface ReadErrorTileProps {
  error: ReadErrorInput
  isAdmin: boolean
  onRetry: () => void
}

/** `Tile variant="status" status="danger"` role=alert with the mapped copy, details, and the action (Try again / Open Recipe Assistant settings / Choose another model). TODO(ra-e developer). */
export function ReadErrorTile(props: ReadErrorTileProps): ReactNode {
  void props
  return null
}
