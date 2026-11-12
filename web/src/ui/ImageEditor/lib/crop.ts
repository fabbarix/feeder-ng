import { fitWithin } from './size'

/**
 * The pure crop maths of the image editor (no React, no DOM; docs/dev/design/photo-read.md, section 3.3).
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

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/** The crop shown first: the whole image for 'free', else the largest centred rectangle of that aspect (whole pixels). */
export function initialCrop(bounds: Size, aspect: CropAspect): Rect {
  const full = { x: 0, y: 0, width: bounds.width, height: bounds.height }
  if (aspect === 'free' || !(aspect > 0)) return full
  if (bounds.width / bounds.height > aspect) {
    const width = Math.min(bounds.width, Math.max(1, Math.round(bounds.height * aspect)))
    return { x: Math.round((bounds.width - width) / 2), y: 0, width, height: bounds.height }
  }
  const height = Math.min(bounds.height, Math.max(1, Math.round(bounds.width / aspect)))
  return { x: 0, y: Math.round((bounds.height - height) / 2), width: bounds.width, height }
}

/** Keeps a rect inside bounds: size limited to [min(MIN_CROP_PX, bounds side), bounds side], then SHIFTED (not shrunk) to fit. */
// STUB (pr-t1 test step): `_minSide` is accepted but not used yet; the developer makes it the minimum side (default MIN_CROP_PX).
export function clampRect(rect: Rect, bounds: Size, _minSide: number = MIN_CROP_PX): Rect {
  const width = clamp(Math.round(rect.width), Math.min(MIN_CROP_PX, bounds.width), bounds.width)
  const height = clamp(Math.round(rect.height), Math.min(MIN_CROP_PX, bounds.height), bounds.height)
  return {
    x: clamp(Math.round(rect.x), 0, bounds.width - width),
    y: clamp(Math.round(rect.y), 0, bounds.height - height),
    width,
    height,
  }
}

/** Translates by (dx, dy), size unchanged, stopping at the edges. */
export function moveRect(rect: Rect, dx: number, dy: number, bounds: Size, _minSide: number = MIN_CROP_PX): Rect {
  return clampRect({ ...rect, x: rect.x + Math.round(dx), y: rect.y + Math.round(dy) }, bounds)
}

/**
 * Moves one handle by (dx, dy).
 * Free: an edge handle changes only its own side; a corner changes two sides; the opposite sides stay put; clamped to bounds and MIN_CROP_PX.
 * Locked: only corners work (an edge handle returns the rect unchanged); the OPPOSITE corner stays put; the dominant axis decides
 * (|dx| against |dy * aspect|), the other side follows to keep width / height == aspect (within 1 px of rounding); clamped so the rect stays inside bounds
 * and its shorter side is at least MIN_CROP_PX.
 */
export function resizeRect(rect: Rect, handle: Handle, dx: number, dy: number, bounds: Size, aspect: CropAspect, _minSide: number = MIN_CROP_PX): Rect {
  dx = Math.round(dx)
  dy = Math.round(dy)
  const west = handle.includes('w')
  const east = handle.includes('e')
  const north = handle.includes('n')
  const south = handle.includes('s')
  if (aspect === 'free' || !(aspect > 0)) {
    let left = rect.x
    let top = rect.y
    let right = rect.x + rect.width
    let bottom = rect.y + rect.height
    const minW = Math.min(MIN_CROP_PX, bounds.width)
    const minH = Math.min(MIN_CROP_PX, bounds.height)
    if (west) left = clamp(left + dx, 0, right - minW)
    if (east) right = clamp(right + dx, left + minW, bounds.width)
    if (north) top = clamp(top + dy, 0, bottom - minH)
    if (south) bottom = clamp(bottom + dy, top + minH, bounds.height)
    return { x: left, y: top, width: right - left, height: bottom - top }
  }
  if (handle.length !== 2) return rect
  // Locked: the corner opposite the handle is the anchor.
  const anchorX = west ? rect.x + rect.width : rect.x
  const anchorY = north ? rect.y + rect.height : rect.y
  const room = { w: west ? anchorX : bounds.width - anchorX, h: north ? anchorY : bounds.height - anchorY }
  const sx = west ? -1 : 1
  const sy = north ? -1 : 1
  const wantW = rect.width + sx * dx
  const wantH = rect.height + sy * dy
  let width = Math.abs(sx * dx) >= Math.abs(sy * dy * aspect) ? wantW : wantH * aspect
  const limit = Math.floor(Math.min(room.w, room.h * aspect))
  const smallest = Math.min(limit, Math.ceil(Math.max(MIN_CROP_PX, MIN_CROP_PX * aspect)))
  width = Math.round(clamp(width, smallest, limit))
  const height = Math.max(1, Math.round(width / aspect))
  return { x: west ? anchorX - width : anchorX, y: north ? anchorY - height : anchorY, width, height }
}

/**
 * The crop after the image is turned a quarter turn (delta 1 = clockwise, -1 = counter-clockwise); `bounds` is the size BEFORE the turn.
 * Free: the same area, mapped (clockwise: x' = H - y - h, y' = x, width' = h, height' = w). Locked: the aspect applies to the output, so the
 * crop starts again as initialCrop(new bounds, aspect).
 */
export function rotateCrop(rect: Rect, bounds: Size, delta: 1 | -1, aspect: CropAspect): Rect {
  const turned = { width: bounds.height, height: bounds.width }
  if (aspect !== 'free') return initialCrop(turned, aspect)
  if (delta === 1) return { x: bounds.height - rect.y - rect.height, y: rect.x, width: rect.height, height: rect.width }
  return { x: rect.y, y: bounds.width - rect.x - rect.width, width: rect.height, height: rect.width }
}

/** Maps a rect in turned-image pixels back to the ORIGINAL image's pixels (inverse of `turns` clockwise quarter turns of a srcW x srcH picture). */
export function rectInSource(rect: Rect, turns: 0 | 1 | 2 | 3, srcW: number, srcH: number): Rect {
  switch (turns) {
    case 1: // turned width = srcH: undo with a counter-clockwise turn
      return { x: rect.y, y: srcH - rect.x - rect.width, width: rect.height, height: rect.width }
    case 2:
      return { x: srcW - rect.x - rect.width, y: srcH - rect.y - rect.height, width: rect.width, height: rect.height }
    case 3: // turned height = srcW: undo with a clockwise turn
      return { x: srcW - rect.y - rect.height, y: rect.x, width: rect.height, height: rect.width }
    default:
      return rect
  }
}

/** The size to render the crop at: the crop size, scaled down (never up) so the long edge is at most maxSide (same rounding as internal/imaging ScaledSize). */
export function outputSize(rect: Rect, maxSide: number): Size {
  return fitWithin(rect.width, rect.height, maxSide)
}

/** The rect as CSS percentages of the bounds (for the overlay): left, top, width, height in 0..100. */
export function rectToPercent(rect: Rect, bounds: Size): { left: number; top: number; width: number; height: number } {
  return {
    left: (rect.x / bounds.width) * 100,
    top: (rect.y / bounds.height) * 100,
    width: (rect.width / bounds.width) * 100,
    height: (rect.height / bounds.height) * 100,
  }
}

/** True when the rect is the whole image (nothing is cropped). */
export function isFullImage(rect: Rect, bounds: Size): boolean {
  return rect.x === 0 && rect.y === 0 && rect.width === bounds.width && rect.height === bounds.height
}

/** Handles on offer: the four corners when the aspect is locked, all eight when free. */
export function handlesFor(aspect: CropAspect): Handle[] {
  return aspect === 'free' ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] : ['nw', 'ne', 'se', 'sw']
}

const HANDLE_NAMES: Record<Handle, string> = {
  nw: 'top left corner',
  n: 'top edge',
  ne: 'top right corner',
  e: 'right edge',
  se: 'bottom right corner',
  s: 'bottom edge',
  sw: 'bottom left corner',
  w: 'left edge',
}

/** The accessible name of a handle: "Resize crop, top left corner", "Resize crop, top edge", ... */
export function handleLabel(handle: Handle): string {
  return `Resize crop, ${HANDLE_NAMES[handle]}`
}
