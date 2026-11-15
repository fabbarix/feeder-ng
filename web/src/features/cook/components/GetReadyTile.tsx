// B9-45 (PC-05, decision PC 6): the "Get ready" tile Cook Mode opens on: the Ingredients scaled to the planned portions, ticked off
// locally before the first Step. Start cooking is the nav's; the tile has no button of its own.
import type { ReactElement } from 'react'
import { Tile } from '../../../ui'
import type { ReadySection } from '../lib/ingredients'
import { cookStrings } from '../strings'
import { ReadyList } from './ReadyList'

export interface GetReadyTileProps {
  sections: ReadySection[]
  /** lib/ingredients readyMeta. */
  meta: string
  /** Keys of the ticked rows (local to the device; ticking changes no Stock). */
  ticked: ReadonlySet<string>
  onToggle: (key: string) => void
}

export function GetReadyTile({ sections, meta, ticked, onToggle }: GetReadyTileProps): ReactElement | null {
  return (
    <Tile as="article" span="full" className="get-ready" aria-label={cookStrings.getReady}>
      <header className="get-ready__head">
        <h2 className="get-ready__title">{cookStrings.getReady}</h2>
        <p className="get-ready__meta">{meta}</p>
      </header>
      <ReadyList sections={sections} ticked={ticked} onToggle={onToggle} />
    </Tile>
  )
}
