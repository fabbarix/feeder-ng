import { useRef, useState } from 'react'
import { handlesFor, MIN_CROP_PX, rectToPercent, isFullImage, type CropAspect, type Handle, type Size } from '../lib/crop'
import { dragTo, nudge, reset as resetEdit, turn, type ImageEdit } from '../lib/edit'
import { turnedSize } from '../lib/turns'
import { imageEditorStrings as t } from '../strings'

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

interface Drag {
  kind: 'move' | Handle
  pointerId: number
  x: number
  y: number
  /** The edit when the drag began: every move is measured from it. */
  start: ImageEdit
}

interface TurnNote {
  kind: 'right' | 'left'
  /** The edit the turn produced; the note stays while the value is still this edit. */
  edit: ImageEdit
}

const sameEdit = (a: ImageEdit, b: ImageEdit) =>
  a.turns === b.turns && a.crop.x === b.crop.x && a.crop.y === b.crop.y && a.crop.width === b.crop.width && a.crop.height === b.crop.height

/** The controlled state of the image editor (docs/dev/design/photo-read.md, section 4.3): derived from `value`, every change goes out through onChange. */
export function useImageEditor(options: UseImageEditorOptions): UseImageEditor {
  const { value, onChange, width, height, aspect, viewWidth } = options
  const minSide = options.minSide ?? MIN_CROP_PX
  const size: Size = { width, height }
  const bounds = turnedSize(width, height, value.turns)
  const [dragging, setDragging] = useState(false)
  const [note, setNote] = useState<TurnNote | null>(null)
  const drag = useRef<Drag | null>(null)

  const rotate = (delta: 1 | -1) => {
    const next = turn(value, size, delta, aspect)
    setNote({ kind: delta === 1 ? 'right' : 'left', edit: next })
    onChange(next)
  }

  const reset = () => {
    setNote(null)
    onChange(resetEdit(size, aspect))
  }

  const begin = (kind: 'move' | Handle, e: PointerLike) => {
    if (!(viewWidth > 0)) return
    drag.current = { kind, pointerId: e.pointerId, x: e.clientX, y: e.clientY, start: value }
    setDragging(true)
  }

  const moveDrag = (e: PointerLike) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    onChange(dragTo(d.start, size, d.kind, e.clientX - d.x, e.clientY - d.y, viewWidth, aspect, minSide))
  }

  const end = (e?: PointerLike) => {
    if (e && drag.current && drag.current.pointerId !== e.pointerId) return
    drag.current = null
    setDragging(false)
  }

  const key = (kind: 'move' | Handle, e: KeyLike): boolean => {
    const next = nudge(value, size, kind, e.key, e.shiftKey, aspect, minSide)
    if (!next) return false
    e.preventDefault()
    onChange(next)
    return true
  }

  const turnNote = note && sameEdit(note.edit, value) ? `${note.kind === 'right' ? t.turnedRight : t.turnedLeft} ` : ''

  return {
    bounds,
    percent: rectToPercent(value.crop, bounds),
    handles: handlesFor(aspect),
    dragging,
    changed: value.turns !== 0 || !isFullImage(value.crop, bounds),
    rotate,
    reset,
    begin,
    drag: moveDrag,
    end,
    key,
    readout: `${turnNote}${t.cropArea(value.crop.width, value.crop.height)}`,
  }
}
