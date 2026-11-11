// Pure reorder maths of ui/Sortable (design: docs/dev/design/sort-drag.md). No React, no DOM. STUBS: tests first.

export type PointerKind = 'mouse' | 'touch' | 'pen'
export interface Slot {
  top: number
  bottom: number
}

/** Pixels a pointer must travel from its pointer-down before a drag starts. */
export const DRAG_THRESHOLD: Record<PointerKind, number> = { mouse: 0, touch: 0, pen: 0 }
/** Auto-scroll: the edge zone in px and the largest step per frame in px. */
export const AUTO_SCROLL_EDGE = 0
export const AUTO_SCROLL_MAX_STEP = 0

const todo = (): never => {
  throw new Error('not implemented')
}

/** A new array with the item at `from` moved to `to` (both clamped to the list); the input is never mutated. */
export function moveItem<T>(_list: readonly T[], _from: number, _to: number): T[] {
  return todo()
}
/** The original indices 0..count-1 in the order they are shown while `from` is being moved to `to`. */
export function displayOrder(_count: number, _from: number, _to: number): number[] {
  return todo()
}
/** The slot index under vertical position `y`, from the rects measured at drag start (clamped to the first and last slot). */
export function slotAt(_slots: readonly Slot[], _y: number): number {
  return todo()
}
/** Scroll step for this frame: negative near/above `bounds.top`, positive near/below `bounds.bottom`, 0 elsewhere. */
export function autoScrollDelta(_y: number, _bounds: Slot, _edge?: number, _maxStep?: number): number {
  return todo()
}
/** True once the pointer travelled further than the threshold of its kind. */
export function exceedsThreshold(_dx: number, _dy: number, _kind: PointerKind): boolean {
  return todo()
}
/** The target index after a keyboard move key (ArrowUp, ArrowDown, Home, End), or null for any other key. May equal `to` at an edge. */
export function keyTarget(_key: string, _to: number, _count: number): number | null {
  return todo()
}
