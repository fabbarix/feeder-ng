import type { ReactNode } from 'react'
import type { ImageEdit, Size } from '../../../ui'
import type { EditSession } from '../lib/photoPages'

export interface PhotoEditorPanelProps {
  session: EditSession
  /** 1-based position ("Edit photo n"). */
  number: number
  /** The working copy's URL and size (the editor works on it). */
  src: string
  size: Size
  /** isSmallPhoto(draftOutputSize): the editor's warning. */
  small: boolean
  /** The photo was just taken with the camera: Retake is offered instead of Cancel. */
  canRetake: boolean
  onChange: (draft: ImageEdit) => void
  onUse: () => void
  onCancel: () => void
  onRetake: () => void
}

/** STUB. */
export function PhotoEditorPanel(_props: PhotoEditorPanelProps): ReactNode {
  return null
}
