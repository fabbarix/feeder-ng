import type { ReactElement } from 'react'
import type { UseSoonItem } from '../types'

export interface UseSoonTileProps {
  items: UseSoonItem[]
}

/** "Use soon": Ingredient names with their go-off wording, in the fixed spoil colour. Renders nothing when empty. Not implemented yet. */
export function UseSoonTile(_props: UseSoonTileProps): ReactElement | null {
  throw new Error('UseSoonTile: not implemented')
}
