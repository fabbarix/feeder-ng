import type { ReactNode } from 'react'
import type { UsePhotoPages } from '../hooks/usePhotoPages'

export interface ReadPhotoPanelProps {
  pages: UsePhotoPages
  /** The Read step is locked (a read runs, the Assistant is off). */
  disabled?: boolean
}

/** STUB. */
export function ReadPhotoPanel(_props: ReadPhotoPanelProps): ReactNode {
  return null
}
