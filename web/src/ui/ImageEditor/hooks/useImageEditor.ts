import type { CropAspect, Handle, Size } from '../lib/crop'
import type { ImageEdit } from '../lib/edit'

export interface UseImageEditorOptions {
  /** The controlled edit. */
  value: ImageEdit
  onChange: (edit: ImageEdit) => void
  /** The picture's own (un-turned) pixel size. */
  width: number
  height: number
  aspect: CropAspect
  /** Smallest crop side in picture pixels (default MIN_CROP_PX). */
  minSide?: number
  /** The width in CSS px the picture is shown at; 0 = not measured yet, drags then do nothing. */
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

export interface UseImageEditor {
  /** Size of the turned picture. */
  bounds: Size
  percent: { left: number; top: number; width: number; height: number }
  handles: Handle[]
  dragging: boolean
  /** Turned, or the crop is smaller than the picture. */
  changed: boolean
  rotate(delta: 1 | -1): void
  reset(): void
  begin(kind: 'move' | Handle, e: PointerLike): void
  drag(e: PointerLike): void
  end(e?: PointerLike): void
  /** Arrow keys: true (and preventDefault) when handled, false for any other key. */
  key(kind: 'move' | Handle, e: KeyLike): boolean
  /** "Crop area: W by H pixels", prefixed "Turned right. " / "Turned left. " right after a turn. */
  readout: string
}

/** The controlled state of the image editor (docs/dev/design/photo-read.md, section 4.3). STUB (pr-t1 test step). */
export function useImageEditor(_options: UseImageEditorOptions): UseImageEditor {
  throw new Error('not implemented')
}
