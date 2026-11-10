import type { ReactNode } from 'react'
import type { CropAspect, Rect } from '../lib/crop'

export interface CropEditorProps {
  /** Object URL (or URL) of the picture to crop. */
  src: string
  /** Original pixel size. */
  width: number
  height: number
  aspect: CropAspect
  /** Long edge of the result, used for the size read-out. */
  maxSide: number
  busy?: boolean
  /** Use crop: the turns and crop to apply. Not called when nothing changed (then onCancel). */
  onApply: (result: { turns: 0 | 1 | 2 | 3; crop: Rect }) => void
  onCancel: () => void
}

/**
 * IP1 stub. The crop editor panel, built on our primitives (no native UI): role=group "Crop image" with the picture, a crop box ("Move crop area")
 * with resize handles (buttons named by lib/crop handleLabel, >= 44 px, touch-action none, pointer events), a status read-out
 * ("Crop area: W by H pixels", role=status), Rotate left / Rotate right / Reset / Cancel / Use crop. Escape cancels. Renders nothing yet.
 */
export function CropEditor(_props: CropEditorProps): ReactNode {
  return null
}
