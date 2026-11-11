import type { ReactNode } from 'react'
import type { ReadInput, ReadState } from '../types'

export interface ReadProgressProps {
  kind: ReadInput['kind']
  state: ReadState | undefined
  elapsedSeconds: number
  onCancel: () => void
}

/** The stage of a running read in one polite live region, the stages as a list, "Still working…" after 20 s, and Cancel. TODO(ra-e developer). */
export function ReadProgress(props: ReadProgressProps): ReactNode {
  void props
  return null
}
