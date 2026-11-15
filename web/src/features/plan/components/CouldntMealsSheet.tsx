// B9-32 (PC-07): the sheet "Show which meals" opens. STUB (test author): the developer builds it.
import type { ReactNode } from 'react'
import type { NoticeGroup } from '../hooks/useCouldntPlanNotice'
import type { SlotKey } from '../types'

export interface CouldntMealsSheetProps {
  open: boolean
  onClose: () => void
  groups: NoticeGroup[]
  /** "Choose a Recipe" on one meal: opens the Recipe chooser for that Course. */
  onChoose: (key: SlotKey) => void
}

/** The affected meals by cause and day, each with Choose a Recipe; it also holds the long explanation the tile leaves out. */
export function CouldntMealsSheet(_props: CouldntMealsSheetProps): ReactNode {
  return null
}
