/**
 * IP1 stub. The pure crop maths of the ImagePicker (no React, no DOM; docs/dev/design/ip1-imagepicker.md, "Crop").
 * All rectangles are in PIXELS OF THE TURNED IMAGE (the picture after the user's quarter turns), integers, origin top-left.
 */

/** A crop area. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

/** `width / height` to lock the crop to (4/3, 1, ...) or `'free'`. */
export type CropAspect = number | 'free'

/** Aspect presets per use: Recipe photo and Ingredient image 4:3, Member avatar 1:1, "Read from a photo" free. */
export const CROP_ASPECTS = { landscape: 4 / 3, square: 1, free: 'free' } as const

/** The eight handles: corners and edge middles (n = top, e = right, s = bottom, w = left). */
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/** The smallest crop side in pixels (or the whole image side when the image is smaller). */
export const MIN_CROP_PX = 16

/** IP1 stub. The crop shown first: the whole image for 'free', else the largest centred rectangle of that aspect (sizes and offsets rounded to whole pixels). */
export function initialCrop(bounds: Size, _aspect: CropAspect): Rect {
  return { x: 0, y: 0, width: bounds.width, height: bounds.height }
}

/** IP1 stub. Keeps a rect inside bounds: size limited to [min(MIN_CROP_PX, bounds side), bounds side], then SHIFTED (not shrunk) to fit. */
export function clampRect(rect: Rect, _bounds: Size): Rect {
  return rect
}

/** IP1 stub. Translates by (dx, dy), size unchanged, stopping at the edges. */
export function moveRect(rect: Rect, _dx: number, _dy: number, _bounds: Size): Rect {
  return rect
}

/**
 * IP1 stub. Moves one handle by (dx, dy).
 * Free: an edge handle changes only its own side; a corner changes two sides; the opposite sides stay put; result clamped to bounds and MIN_CROP_PX.
 * Locked: only corners work (an edge handle returns the rect unchanged); the OPPOSITE corner stays put; the dominant axis decides
 * (|dx| against |dy * aspect|), the other side follows to keep width / height == aspect (within 1 px of rounding); clamped so the rect stays inside bounds
 * and its shorter side is at least MIN_CROP_PX.
 */
export function resizeRect(rect: Rect, _handle: Handle, _dx: number, _dy: number, _bounds: Size, _aspect: CropAspect): Rect {
  return rect
}

/**
 * IP1 stub. The crop after the image is turned a quarter turn (delta 1 = clockwise, -1 = counter-clockwise); `bounds` is the size BEFORE the turn.
 * Free: the same area, mapped (clockwise: x' = H - y - h, y' = x, width' = h, height' = w). Locked: the aspect applies to the output, so the
 * crop starts again as initialCrop(new bounds, aspect).
 */
export function rotateCrop(rect: Rect, _bounds: Size, _delta: 1 | -1, _aspect: CropAspect): Rect {
  return rect
}

/** IP1 stub. Maps a rect in turned-image pixels back to the ORIGINAL image's pixels (inverse of `turns` clockwise quarter turns of a srcW x srcH picture). */
export function rectInSource(rect: Rect, _turns: 0 | 1 | 2 | 3, _srcW: number, _srcH: number): Rect {
  return rect
}

/** IP1 stub. The size to render the crop at: the crop size, scaled down (never up) so the long edge is at most maxSide (same rounding as internal/imaging ScaledSize). */
export function outputSize(rect: Rect, _maxSide: number): Size {
  return { width: rect.width, height: rect.height }
}

/** IP1 stub. The rect as CSS percentages of the bounds (for the overlay): left, top, width, height in 0..100. */
export function rectToPercent(_rect: Rect, _bounds: Size): { left: number; top: number; width: number; height: number } {
  return { left: 0, top: 0, width: 100, height: 100 }
}

/** IP1 stub. True when the rect is the whole image (nothing is cropped). */
export function isFullImage(_rect: Rect, _bounds: Size): boolean {
  return false
}

/** IP1 stub. Handles on offer: the four corners when the aspect is locked, all eight when free. Order: nw, n, ne, e, se, s, sw, w (corners only: nw, ne, se, sw). */
export function handlesFor(_aspect: CropAspect): Handle[] {
  return []
}

/** IP1 stub. The accessible name of a handle: "Resize crop, top left corner", "Resize crop, top edge", ... */
export function handleLabel(_handle: Handle): string {
  return ''
}
