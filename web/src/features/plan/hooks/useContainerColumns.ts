import { useRef, type RefObject } from 'react'

/**
 * R2-2 (L-05): the week grid's columns from the width of the element `ref` is attached to (ResizeObserver,
 * lib/columns planColumnsForContainer). Before the first measure, and without ResizeObserver, it answers 4 (never the
 * cramped 7). STUB: the Developer implements it.
 */
export function useContainerColumns(): { ref: RefObject<HTMLDivElement | null>; columns: 2 | 4 | 7 } {
  const ref = useRef<HTMLDivElement | null>(null)
  return { ref, columns: 7 }
}
