import { initialCrop, isFullImage, moveRect, resizeRect, rotateCrop, type CropAspect, type Handle, type Rect, type Size } from './crop'
import { addTurn, turnedSize, type Turns } from './turns'

/**
 * The editable state of one picture: quarter turns and a crop in pixels of the TURNED picture (docs/dev/design/photo-read.md, sections 3.3 and 3.4).
 */
export interface ImageEdit {
  turns: Turns
  crop: Rect
}

export type EditTarget = 'move' | Handle

const STEP_KEYS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/** No turn and the initial crop for the aspect (the whole picture for 'free'). `size` is the picture's own (un-turned) size. */
export function initialEdit(size: Size, aspect: CropAspect = 'free'): ImageEdit {
  return { turns: 0, crop: initialCrop(size, aspect) }
}

/** True when there is no turn and the crop is the whole picture. */
export function isFullEdit(edit: ImageEdit, size: Size): boolean {
  return edit.turns === 0 && isFullImage(edit.crop, size)
}

/** Arrow keys only (null for any other key). */
export function nudge(edit: ImageEdit, size: Size, target: EditTarget, key: string, shift: boolean, aspect: CropAspect, minSide?: number): ImageEdit | null {
  const arrow = STEP_KEYS[key]
  if (!arrow) return null
  const bounds = turnedSize(size.width, size.height, edit.turns)
  const step = Math.max(1, Math.round(Math.max(bounds.width, bounds.height) / 100)) * (shift ? 10 : 1)
  const dx = arrow[0] * step
  const dy = arrow[1] * step
  const crop = target === 'move' ? moveRect(edit.crop, dx, dy, bounds, minSide) : resizeRect(edit.crop, target, dx, dy, bounds, aspect, minSide)
  return { turns: edit.turns, crop }
}

/** A pointer drag: the CSS px delta from where the drag began, scaled to picture pixels, applied to the edit the drag began with. */
export function dragTo(start: ImageEdit, size: Size, target: EditTarget, dxCss: number, dyCss: number, viewWidth: number, aspect: CropAspect, minSide?: number): ImageEdit {
  if (!(viewWidth > 0)) return start
  const bounds = turnedSize(size.width, size.height, start.turns)
  const scale = bounds.width / viewWidth
  const dx = dxCss * scale
  const dy = dyCss * scale
  const crop = target === 'move' ? moveRect(start.crop, dx, dy, bounds, minSide) : resizeRect(start.crop, target, dx, dy, bounds, aspect, minSide)
  return { turns: start.turns, crop }
}

/** rotateCrop + addTurn. `size` is the picture's own (un-turned) size. */
export function turn(edit: ImageEdit, size: Size, delta: 1 | -1, aspect: CropAspect): ImageEdit {
  const before = turnedSize(size.width, size.height, edit.turns)
  return { turns: addTurn(edit.turns, delta), crop: rotateCrop(edit.crop, before, delta, aspect) }
}

/** Back to no turns and the initial crop. */
export function reset(size: Size, aspect: CropAspect): ImageEdit {
  return initialEdit(size, aspect)
}


