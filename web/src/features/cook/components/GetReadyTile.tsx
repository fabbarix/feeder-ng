import type { ReactElement } from 'react'
import type { ReadySection } from '../lib/ingredients'

export interface GetReadyTileProps {
  sections: ReadySection[]
  /** lib/ingredients readyMeta. */
  meta: string
  /** Keys of the ticked rows (local to the device; ticking changes no Stock). */
  ticked: ReadonlySet<string>
  onToggle: (key: string) => void
}

/**
 * B9-45 (PC-05) STUB. The "Get ready" tile Cook Mode opens on: an article named "Get ready" with a title, the meta line and the list of Ingredient
 * rows (our own Checkbox, the name, the Storage Place under it, the scaled amount at the end). The developer builds it.
 */
export function GetReadyTile(_props: GetReadyTileProps): ReactElement | null {
  throw new Error('B9-45: not built yet')
}
