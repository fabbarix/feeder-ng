import type { Rect, Size } from './crop'
import type { ImageEdit } from './edit'

/**
 * The single drawImage of a render (docs/dev/design/photo-read.md, section 3.5): the source rect in WORKING-COPY pixels, the canvas size,
 * the rotation about the canvas centre in DEGREES (turns * 90), and the destination box before the rotation, centred on the canvas centre (x = -w/2, y = -h/2; width and height swapped for odd turns). STUB (pr-t1 test step).
 */
export function drawPlan(_working: Size, _edit: ImageEdit, _maxSide: number): { canvas: Size; source: Rect; rotate: number; dest: Rect } {
  throw new Error('not implemented')
}
