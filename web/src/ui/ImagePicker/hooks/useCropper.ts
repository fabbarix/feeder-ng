import { useState } from 'react'
import { outputSize, type CropAspect, type Rect } from '../../ImageEditor/lib/crop'
import { initialEdit, type ImageEdit } from '../../ImageEditor/lib/edit'
import { useImageEditor, type UseImageEditor } from '../../ImageEditor/hooks/useImageEditor'

export type { KeyLike, PointerLike } from '../../ImageEditor/hooks/useImageEditor'

export interface UseCropperOptions {
  /** The ORIGINAL picture's pixel size. */
  width: number
  height: number
  aspect: CropAspect
  /** The width in CSS px the picture is shown at; 0 (the default) when the host draws the pointer itself. */
  viewWidth?: number
}

export interface CropOutput {
  turns: 0 | 1 | 2 | 3
  /** In turned-image pixels (what the ImageEngine and prepareImage take). */
  crop: Rect
  /** Output size: the crop scaled so the long edge is at most maxSide. */
  width: number
  height: number
}

export interface UseCropper extends UseImageEditor {
  /** The edit (turns and crop) the cropper holds. */
  edit: ImageEdit
  setEdit(edit: ImageEdit): void
  turns: 0 | 1 | 2 | 3
  rect: Rect
  output(maxSide: number): CropOutput
}

/** The crop state of a picker: the edit is held here (useState), and every change goes through useImageEditor. */
export function useCropper(options: UseCropperOptions): UseCropper {
  const { width, height, aspect, viewWidth = 0 } = options
  const key = `${width}x${height}@${aspect}`
  const [state, setState] = useState<{ key: string; edit: ImageEdit }>(() => ({ key, edit: initialEdit({ width, height }, aspect) }))
  // A different picture or aspect starts the editor again (derived state, adjusted during render).
  let current = state
  if (state.key !== key) {
    current = { key, edit: initialEdit({ width, height }, aspect) }
    setState(current)
  }
  const { edit } = current
  const setEdit = (next: ImageEdit) => setState((s) => ({ ...s, edit: next }))
  const editor = useImageEditor({ value: edit, onChange: setEdit, width, height, aspect, viewWidth })
  return {
    ...editor,
    edit,
    setEdit,
    turns: edit.turns,
    rect: edit.crop,
    output: (maxSide: number): CropOutput => ({ turns: edit.turns, crop: edit.crop, ...outputSize(edit.crop, maxSide) }),
  }
}
