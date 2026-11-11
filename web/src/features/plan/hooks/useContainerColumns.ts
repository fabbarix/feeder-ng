import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { planColumnsForContainer } from '../lib/columns'

/**
 * R2-2 (L-05): the week grid's columns from the width of the element `ref` is attached to (ResizeObserver,
 * lib/columns planColumnsForContainer). Before the first measure, and without ResizeObserver, it answers 4 (never the
 * cramped 7). The first measure is synchronous (layout effect, getBoundingClientRect); the observer follows resizes.
 */
export function useContainerColumns(): { ref: RefObject<HTMLDivElement | null>; columns: 2 | 4 | 7 } {
  const ref = useRef<HTMLDivElement | null>(null)
  const [columns, setColumns] = useState<2 | 4 | 7>(4)
  // The first measure is synchronous, before the first paint: a desktop never shows 4 columns for a frame.
  useLayoutEffect(() => {
    const width = ref.current?.getBoundingClientRect().width
    if (width) setColumns(planColumnsForContainer(width))
  }, [])
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (entry) setColumns(planColumnsForContainer(entry.contentRect.width))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { ref, columns }
}
