import type { ReactElement } from 'react'
import type { ReadySection } from '../lib/ingredients'

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

/** B9-45 (PC-05) STUB. The Ingredients button's sheet during cooking: the same rows as Get ready, with the R-B Close. The developer builds it. */
export function IngredientsSheet(_props: IngredientsSheetProps): ReactElement | null {
  throw new Error('B9-45: not built yet')
}
