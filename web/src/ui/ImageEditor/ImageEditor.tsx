import type { ReactNode } from 'react'
import type { CropAspect } from './lib/crop'
import type { ImageEdit } from './lib/edit'
import './ImageEditor.css'

export interface ImageEditorProps {
  /** Object URL (or URL) of the picture, in its own (un-turned) orientation. */
  src: string
  /** The picture's own pixel size. */
  width: number
  height: number
  aspect: CropAspect
  /** The controlled edit (turns and crop). */
  value: ImageEdit
  onChange: (edit: ImageEdit) => void
  /** Smallest crop side in picture pixels (default 16). */
  minSide?: number
  busy?: boolean
  /** Focus the crop box when the editor opens. */
  autoFocus?: boolean
  /** Escape. */
  onCancel: () => void
  /** The host's own buttons, rendered after Rotate left, Rotate right and Reset. */
  children?: ReactNode
}

/** STUB (pr-t1 test step): renders nothing yet. */
export function ImageEditor(_props: ImageEditorProps) {
  return null
}
