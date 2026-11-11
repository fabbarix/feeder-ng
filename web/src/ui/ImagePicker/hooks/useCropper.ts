import { useCallback, useRef, useState } from 'react'
import { handlesFor, initialCrop, isFullImage, moveRect, outputSize, rectToPercent, resizeRect, rotateCrop, type CropAspect, type Handle, type Rect, type Size } from '../lib/crop'
import { addTurn, turnedSize } from '../lib/prepare'

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

interface Drag {
  kind: 'move' | Handle
  pointerId: number
  x: number
  y: number
  rect: Rect
}

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/** State for the crop editor: rotation, crop rect, pointer drag and keyboard nudging (uses lib/crop). */
export function useCropper(options: UseCropperOptions): UseCropper {
  const { width, height, aspect, viewWidth } = options
  const key = `${width}x${height}@${aspect}`
  const [state, setState] = useState<{ key: string; turns: 0 | 1 | 2 | 3; rect: Rect }>(() => ({ key, turns: 0, rect: initialCrop({ width, height }, aspect) }))
  // A different picture or aspect starts the editor again (derived state, adjusted during render).
  let current = state
  if (state.key !== key) {
    current = { key, turns: 0, rect: initialCrop({ width, height }, aspect) }
    setState(current)
  }
  const { turns, rect } = current
  const bounds: Size = turnedSize(width, height, turns)
  const boundsRef = useRef(bounds)
  boundsRef.current = bounds
  const aspectRef = useRef(aspect)
  aspectRef.current = aspect
  const viewRef = useRef(viewWidth)
  viewRef.current = viewWidth
  const rectRef = useRef(rect)
  rectRef.current = rect
  const drag = useRef<Drag | null>(null)
  const [dragging, setDragging] = useState(false)

  const setRect = useCallback((next: Rect) => setState((s) => ({ ...s, rect: next })), [])

  const rotate = useCallback(
    (delta: 1 | -1) =>
      setState((s) => {
        const before = turnedSize(width, height, s.turns)
        return { ...s, turns: addTurn(s.turns, delta), rect: rotateCrop(s.rect, before, delta, aspectRef.current) }
      }),
    [width, height],
  )

  const reset = useCallback(() => setState((s) => ({ ...s, turns: 0, rect: initialCrop({ width, height }, aspectRef.current) })), [width, height])

  const begin = useCallback((kind: 'move' | Handle, e: PointerLike) => {
    if (!(viewRef.current > 0)) return
    drag.current = { kind, pointerId: e.pointerId, x: e.clientX, y: e.clientY, rect: rectRef.current }
    setDragging(true)
  }, [])

  const dragTo = useCallback(
    (e: PointerLike) => {
      const d = drag.current
      if (!d || d.pointerId !== e.pointerId) return
      const scale = boundsRef.current.width / viewRef.current
      const dx = (e.clientX - d.x) * scale
      const dy = (e.clientY - d.y) * scale
      setRect(d.kind === 'move' ? moveRect(d.rect, dx, dy, boundsRef.current) : resizeRect(d.rect, d.kind, dx, dy, boundsRef.current, aspectRef.current))
    },
    [setRect],
  )

  const end = useCallback((e?: PointerLike) => {
    if (e && drag.current && drag.current.pointerId !== e.pointerId) return
    drag.current = null
    setDragging(false)
  }, [])

  const keyDown = useCallback(
    (kind: 'move' | Handle, e: KeyLike): boolean => {
      const arrow = ARROWS[e.key]
      if (!arrow) return false
      e.preventDefault()
      setState((s) => {
        const b = turnedSize(width, height, s.turns)
        const step = Math.max(1, Math.round(Math.max(b.width, b.height) / 100)) * (e.shiftKey ? 10 : 1)
        const dx = arrow[0] * step
        const dy = arrow[1] * step
        return { ...s, rect: kind === 'move' ? moveRect(s.rect, dx, dy, b) : resizeRect(s.rect, kind, dx, dy, b, aspectRef.current) }
      })
      return true
    },
    [width, height],
  )

  const output = useCallback((maxSide: number): CropOutput => ({ turns, crop: rect, ...outputSize(rect, maxSide) }), [turns, rect])

  return {
    turns,
    bounds,
    rect,
    percent: rectToPercent(rect, bounds),
    handles: handlesFor(aspect),
    dragging,
    changed: turns !== 0 || !isFullImage(rect, bounds),
    rotate,
    reset,
    begin,
    drag: dragTo,
    end,
    key: keyDown,
    output,
  }
}
