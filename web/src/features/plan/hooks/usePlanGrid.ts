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
  gapPx?: number
}

/** The root font size and the grid's column gap, read from the page when it has them (jsdom has neither). */
function metricsOf(el: Element): Pick<Measure, 'remPx' | 'gapPx'> {
  if (typeof getComputedStyle !== 'function') return {}
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
  const inner = el.firstElementChild
  const gap = inner ? parseFloat(getComputedStyle(inner).columnGap) : NaN
  return { remPx: Number.isFinite(rem) && rem > 0 ? rem : undefined, gapPx: Number.isFinite(gap) ? gap : undefined }
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
      setMeasure({ width, ...metricsOf(entry.target) })
    })
    ro.observe(el)
    observer.current = ro
  }, [])

  useEffect(() => () => observer.current?.disconnect(), [])

  return useMemo(() => {
    const columns = measure ? gridColumns(measure.width, { remPx: measure.remPx, gapPx: measure.gapPx }) : 1
    const spans = daySpans(count, columns)
    const rows = spans.map((span) => columns > 1 && span === GRID_TRACKS)
    return { columns, spans, rows, ref }
  }, [count, measure, ref])
}
