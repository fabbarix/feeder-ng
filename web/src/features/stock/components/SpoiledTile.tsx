import type { ReactElement } from 'react'
import type { StockLot } from '../types'

export interface SpoiledTileProps {
  lots: StockLot[]
  today: string
  onThrowOut: (lotId: number) => void
  onKeep: (lotId: number) => void
}

/**
 * "Throw out or keep?" for spoiled Stock Lots, in the fixed spoil colour. Each row
 * shows name, amount and go-off wording, with "Throw out" and "Keep" buttons
 * (accessible names "Throw out <name>" / "Keep <name>"). Renders nothing when lots is empty.
 * Exported for the Today screen to embed.
 */
export function SpoiledTile(props: SpoiledTileProps): ReactElement | null {
  void props
  throw new Error('TODO')
}
