// Pure reorder maths of ui/Sortable (design: docs/dev/design/sort-drag.md section 3). No React, no DOM.

export type PointerKind = 'mouse' | 'touch' | 'pen'
export interface Slot {
  top: number
  bottom: number
}

/** Pixels a pointer must travel from its pointer-down before a drag starts. */
export const DRAG_THRESHOLD: Record<PointerKind, number> = {
  mouse: 4,
  touch: 8,
  pen: 8,
}
/** Auto-scroll: the edge zone in px and the largest step per frame in px. */
export const AUTO_SCROLL_EDGE = 48
export const AUTO_SCROLL_MAX_STEP = 20

/** A new array with the item at `from` moved to `to` (both clamped to the list); the input is never mutated. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list]
  if (from < 0 || from >= out.length) return out
  const [item] = out.splice(from, 1)
  out.splice(Math.max(0, Math.min(to, out.length)), 0, item as T)
  return out
}

/** The original indices 0..count-1 in the order they are shown while `from` is being moved to `to`. */
export function displayOrder(count: number, from: number, to: number): number[] {
  return moveItem(
    Array.from({ length: count }, (_, i) => i),
    from,
    to,
  )
}

/** The slot index under vertical position `y`, from the rects measured at drag start (clamped to the first and last slot). */
export function slotAt(slots: readonly Slot[], y: number): number {
  if (slots.length === 0) return 0
  for (let i = 0; i < slots.length; i++) {
    if (y >= slots[i]!.top && y < slots[i]!.bottom) return i
  }
  if (y < slots[0]!.top) return 0
  const last = slots.length - 1
  if (y >= slots[last]!.bottom) return last
  // In a gap between slot i and i + 1: the nearer edge wins, a tie goes to the following slot.
  for (let i = 0; i < last; i++) {
    const above = slots[i]!.bottom
    const below = slots[i + 1]!.top
    if (y >= above && y < below) return y - above < below - y ? i : i + 1
  }
  return last
}

/** Scroll step for this frame: negative near/above `bounds.top`, positive near/below `bounds.bottom`, 0 elsewhere. */
export function autoScrollDelta(y: number, bounds: Slot, edge = AUTO_SCROLL_EDGE, maxStep = AUTO_SCROLL_MAX_STEP): number {
  const intoTop = bounds.top + edge - y
  if (intoTop > 0) return -Math.min(1, intoTop / edge) * maxStep
  const intoBottom = y - (bounds.bottom - edge)
  if (intoBottom > 0) return Math.min(1, intoBottom / edge) * maxStep
  return 0
}

/** True once the pointer travelled further than the threshold of its kind. */
export function exceedsThreshold(dx: number, dy: number, kind: PointerKind): boolean {
  return Math.hypot(dx, dy) > DRAG_THRESHOLD[kind]
}

/** The target index after a keyboard move key (ArrowUp, ArrowDown, Home, End), or null for any other key. May equal `to` at an edge. */
export function keyTarget(key: string, to: number, count: number): number | null {
  switch (key) {
    case 'ArrowUp':
      return Math.max(0, to - 1)
    case 'ArrowDown':
      return Math.min(count - 1, to + 1)
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}
