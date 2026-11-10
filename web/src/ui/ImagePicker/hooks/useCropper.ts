import type { CropAspect, Handle, Rect, Size } from '../lib/crop'

export interface UseCropperOptions {
  /** The ORIGINAL picture's pixel size. */
  width: number
  height: number
  aspect: CropAspect
  /** The width in CSS px the picture is shown at (measured by the component); 0 = not measured yet, drags then do nothing. */
  viewWidth: number
}

/** The part of a pointer event the hook needs (a React PointerEvent fits). */
export interface PointerLike {
  clientX: number
  clientY: number
  pointerId: number
}

/** The part of a keyboard event the hook needs. */
export interface KeyLike {
  key: string
  shiftKey: boolean
  preventDefault(): void
}

export interface CropOutput {
  turns: 0 | 1 | 2 | 3
  /** In turned-image pixels (what the ImageEngine and prepareImage take). */
  crop: Rect
  /** Output size: the crop scaled so the long edge is at most maxSide. */
  width: number
  height: number
}

export interface UseCropper {
  turns: 0 | 1 | 2 | 3
  /** Size of the turned picture. */
  bounds: Size
  rect: Rect
  /** The rect as CSS percentages for the overlay. */
  percent: { left: number; top: number; width: number; height: number }
  handles: Handle[]
  dragging: boolean
  /** Anything to apply: turned, or the crop is smaller than the picture. */
  changed: boolean
  rotate(delta: 1 | -1): void
  /** Back to no turns and the initial crop. */
  reset(): void
  /** Pointer drag on the crop box ('move') or a handle. The delta is measured from where the drag began, scaled by bounds.width / viewWidth. */
  begin(kind: 'move' | Handle, e: PointerLike): void
  drag(e: PointerLike): void
  end(e?: PointerLike): void
  /**
   * Arrow keys: step = max(1, round(longest side of the turned picture / 100)) px, x10 with Shift. On 'move' the box moves; on a handle that
   * handle moves (a corner on both axes). Returns true and calls preventDefault for arrow keys, false for anything else.
   */
  key(kind: 'move' | Handle, e: KeyLike): boolean
  output(maxSide: number): CropOutput
}

/** IP1 stub. State for the crop editor: rotation, crop rect, pointer drag and keyboard nudging (uses lib/crop). */
export function useCropper(options: UseCropperOptions): UseCropper {
  const bounds = { width: options.width, height: options.height }
  const rect = { x: 0, y: 0, width: options.width, height: options.height }
  return {
    turns: 0,
    bounds,
    rect,
    percent: { left: 0, top: 0, width: 100, height: 100 },
    handles: [],
    dragging: false,
    changed: false,
    rotate: () => {},
    reset: () => {},
    begin: () => {},
    drag: () => {},
    end: () => {},
    key: () => false,
    output: () => ({ turns: 0, crop: rect, width: rect.width, height: rect.height }),
  }
}
