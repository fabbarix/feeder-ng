import type { ReactElement } from 'react'
import type { Tag } from '../../../lib/tags'
import type { MergePickerState } from '../types'

export interface MergeTargetDialogProps {
  /** null = closed. */
  state: MergePickerState | null
  tags: readonly Tag[]
  busy: boolean
  onTarget: (id: number) => void
  onReview: () => void
  onClose: () => void
}

/** "Merge fish into…": the shared Tag select (every other Tag), Cancel and Review merge. */
export function MergeTargetDialog(_props: MergeTargetDialogProps): ReactElement | null {
  return null
}
