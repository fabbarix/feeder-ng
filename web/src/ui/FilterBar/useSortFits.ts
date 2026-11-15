// B9-15 (DS-03, DS-10, decision DS 6): whether the Sort chip of a FilterBar view row fits with its value shown. A ResizeObserver watches
// the row; the measure reads the row's inner width, the view control's width, the hidden copy's natural Sort width and the row's gap.
// It measures in rendered px, so it follows text spacing and the browser text size. Unmeasured (jsdom, no row) it fits.
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { sortFits, type SortRowMetrics } from './lib/sortFits'

export type { SortRowMetrics } from './lib/sortFits'

/** Reads a `.filter-bar__view-row`: its first child is the view control, `.filter-bar__sort-measure` the Sort with its value shown. */
export function measureSortRow(row: HTMLElement): SortRowMetrics | null {
  if (row.clientWidth === 0) return null
  const copy = row.querySelector<HTMLElement>(':scope > .filter-bar__sort-measure')
  const view = row.firstElementChild as HTMLElement | null
  if (!copy || !view || view === copy) return null
  const cs = getComputedStyle(row)
  const padding = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
  return {
    row: row.clientWidth - padding,
    view: view.getBoundingClientRect().width,
    natural: copy.getBoundingClientRect().width,
    gap: parseFloat(cs.columnGap) || 0,
  }
}

/** `fits` is true when the Sort shows its value in full beside the view control (and while nothing is measured). */
export function useSortFits(
  row: RefObject<HTMLElement | null>,
  measure: (el: HTMLElement) => SortRowMetrics | null = measureSortRow,
): { fits: boolean } {
  const [fits, setFits] = useState(true)
  const fitRef = useRef<() => void>(() => {})

  // After every render: a new value (a shorter or longer Sort) changes the copy's width without resizing the row.
  useLayoutEffect(() => {
    fitRef.current = () => {
      const el = row.current
      const m = el ? measure(el) : null
      setFits(m === null ? true : sortFits(m))
    }
    fitRef.current()
  })

  useLayoutEffect(() => {
    const el = row.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => fitRef.current())
    observer.observe(el)
    // The hidden copy grows with text spacing or the text size without the row resizing: watch it too.
    const copy = el.querySelector(':scope > .filter-bar__sort-measure')
    if (copy) observer.observe(copy)
    return () => observer.disconnect()
  }, [row])

  return { fits }
}
