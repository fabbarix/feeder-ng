// B9-45 (PC-05): the Ingredients button's sheet during cooking (on a phone and tablet; from 1024 px the list sits in the rail): the same
// rows as Get ready, sharing its ticks, with the sheet's one circular Close.
import type { ReactElement } from 'react'
import { BottomSheet } from '../../../ui'
import type { ReadySection } from '../lib/ingredients'
import { cookStrings } from '../strings'
import { ReadyList } from './ReadyList'

export interface IngredientsSheetProps {
  open: boolean
  onClose: () => void
  /** "Roast chicken · 2.75 portions". */
  context: string
  meta: string
  sections: ReadySection[]
  ticked: ReadonlySet<string>
  onToggle: (key: string) => void
}

export function IngredientsSheet({ open, onClose, context, meta, sections, ticked, onToggle }: IngredientsSheetProps): ReactElement | null {
  return (
    <BottomSheet open={open} onClose={onClose} title={cookStrings.ingredients} context={context}>
      <div className="get-ready">
        <p className="get-ready__meta">{meta}</p>
        <ReadyList sections={sections} ticked={ticked} onToggle={onToggle} />
      </div>
    </BottomSheet>
  )
}
