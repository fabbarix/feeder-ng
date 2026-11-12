import { outputSize, rectInSource, type Rect, type Size } from './crop'
import type { ImageEdit } from './edit'

/**
 * The single drawImage of a render (docs/dev/design/photo-read.md, section 3.5): the source rect in WORKING-COPY pixels, the canvas size,
 * the rotation about the canvas centre in DEGREES (turns * 90), and the destination box before the rotation, centred on the canvas centre
 * (x = -w/2, y = -h/2; width and height swapped for odd turns).
 */
export function drawPlan(working: Size, edit: ImageEdit, maxSide: number): { canvas: Size; source: Rect; rotate: number; dest: Rect } {
  const canvas = outputSize(edit.crop, maxSide)
  const source = rectInSource(edit.crop, edit.turns, working.width, working.height)
  const odd = edit.turns % 2 === 1
  const dw = odd ? canvas.height : canvas.width
  const dh = odd ? canvas.width : canvas.height
  return { canvas, source, rotate: edit.turns * 90, dest: { x: -dw / 2, y: -dh / 2, width: dw, height: dh } }
}
