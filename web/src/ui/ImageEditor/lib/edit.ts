import type { CropAspect, Handle, Rect, Size } from './crop'
import type { Turns } from './turns'

/**
 * The editable state of one picture: quarter turns and a crop in pixels of the TURNED picture (docs/dev/design/photo-read.md, sections 3.3 and 3.4).
 * STUBS (pr-t1 test step): every function below throws until the developer implements it.
 */
export interface ImageEdit {
  turns: Turns
  crop: Rect
}

export type EditTarget = 'move' | Handle

const notImplemented = (): never => {
  throw new Error('not implemented')
}

/** No turn and the initial crop for the aspect (the whole picture for 'free'). `size` is the picture's own (un-turned) size. */
export function initialEdit(_size: Size, _aspect: CropAspect = 'free'): ImageEdit {
  return notImplemented()
}

/** True when there is no turn and the crop is the whole picture. */
export function isFullEdit(_edit: ImageEdit, _size: Size): boolean {
  return notImplemented()
}

/** Arrow keys only (null for any other key). */
export function nudge(_edit: ImageEdit, _size: Size, _target: EditTarget, _key: string, _shift: boolean, _aspect: CropAspect, _minSide?: number): ImageEdit | null {
  return notImplemented()
}

/** A pointer drag, applied to the edit the drag began with. */
export function dragTo(_start: ImageEdit, _size: Size, _target: EditTarget, _dxCss: number, _dyCss: number, _viewWidth: number, _aspect: CropAspect, _minSide?: number): ImageEdit {
  return notImplemented()
}

/** rotateCrop + addTurn. `size` is the picture's own (un-turned) size. */
export function turn(_edit: ImageEdit, _size: Size, _delta: 1 | -1, _aspect: CropAspect): ImageEdit {
  return notImplemented()
}

/** Back to no turns and the initial crop. */
export function reset(_size: Size, _aspect: CropAspect): ImageEdit {
  return notImplemented()
}
