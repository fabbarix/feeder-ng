// B9-32 (PC-11 option B, decision PC 2): the week grid's column count and each day's span, from the measured container.
import { useCallback, useEffect, useMemo, useRef, useState, type RefCallback } from 'react'
import { daySpans, gridColumns, GRID_TRACKS } from '../lib/days'

export interface PlanGridLayout {
  /** Columns of the grid now: min(4, floor((container + gap) / (21 rem + gap))), 1 until the container is measured. */
  columns: number
  /** The span (of 12 tracks) of each of the `count` days, in order. */
  spans: number[]
  /** True for a day that has the whole row while the grid has more than one column: it lays its Meal Slots side by side. */
  rows: boolean[]
}

interface Measure {
  width: number
  remPx?: number
}

/**
 * The root font size, read from the page when it has one (jsdom has none), so a larger text size reflows the week. The gap of
 * the rule stays the chapter's 12 px (gridColumns' default) whatever the Bento gap of the band, so the cut-offs are fixed.
 */
function metricsOf(): Pick<Measure, 'remPx'> {
  if (typeof getComputedStyle !== 'function') return {}
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
  return { remPx: Number.isFinite(rem) && rem > 0 ? rem : undefined }
}

/** Measures the element it is given (a ResizeObserver on its content box) and answers the grid layout for `count` days. */
export function usePlanGrid(count: number): PlanGridLayout & { ref: RefCallback<HTMLElement> } {
  const [measure, setMeasure] = useState<Measure | null>(null)
  const observer = useRef<ResizeObserver | null>(null)

  const ref = useCallback<RefCallback<HTMLElement>>((el) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (!entry) return
      const width = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width
      setMeasure({ width, ...metricsOf() })
    })
    ro.observe(el)
    observer.current = ro
    // w4d review (CLS): measure once now, in the commit, so the first paint already has the real columns (a ResizeObserver
    // answers only after a paint, and the week then jumped from one column to its own).
    const width = el.getBoundingClientRect().width
    if (width > 0) setMeasure({ width, ...metricsOf() })
  }, [])

  useEffect(() => () => observer.current?.disconnect(), [])

  return useMemo(() => {
    const columns = measure ? gridColumns(measure.width, { remPx: measure.remPx }) : 1
    const spans = daySpans(count, columns)
    const rows = spans.map((span) => columns > 1 && span === GRID_TRACKS)
    return { columns, spans, rows, ref }
  }, [count, measure, ref])
}
