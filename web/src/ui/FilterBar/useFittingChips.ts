// How many chips of a one-line chip row fit, the rest collapse into "+N" (docs/design/recipes-filter.md 5.4, 6; pantry-filter.md 5).
// The row is measured after every render and again when it resizes. jsdom lays nothing out, so an unmeasured row shows every chip.
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { fitChips } from '../../lib/filters/fitChips'

export interface ChipLineMetrics {
  /** The width the chips may take. */
  available: number
  /** The natural width of each chip, in order. */
  widths: number[]
  gap: number
  /** The width of the "+N" chip. */
  plusWidth: number
}

/** Reads a line's chips (its direct `.chip` children) and its "+N" chip (`.filter-chips__more`). */
export function measureChipLine(el: HTMLElement): ChipLineMetrics {
  const chips = [...el.querySelectorAll<HTMLElement>(':scope > .chip')]
  // A line with no layout (0 px: jsdom, or not shown) measures as zero, so every chip fits.
  if (el.clientWidth === 0) return { available: 0, widths: chips.map(() => 0), gap: 0, plusWidth: 0 }
  const cs = getComputedStyle(el)
  const padding = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
  const more = el.querySelector<HTMLElement>(':scope > .filter-chips__more')
  return {
    available: el.clientWidth - padding,
    widths: chips.map((c) => c.getBoundingClientRect().width),
    gap: parseFloat(cs.columnGap) || 0,
    plusWidth: more ? more.getBoundingClientRect().width : 0,
  }
}

/** How many of `count` chips show: `visible` of them, `hidden` collapsed into "+N". */
export function useFittingChips(
  line: RefObject<HTMLElement | null>,
  count: number,
  measure: (el: HTMLElement) => ChipLineMetrics = measureChipLine,
): { visible: number; hidden: number } {
  const [shown, setShown] = useState(count)
  const measureRef = useRef(measure)
  const fitRef = useRef<() => void>(() => {})
  const shownNow = useRef(shown)

  // Runs after every render: the measure is the one of this render, and the fit follows the chips the render shows.
  useLayoutEffect(() => {
    measureRef.current = measure
    shownNow.current = Math.min(shown, count)
    fitRef.current = () => {
      const el = line.current
      if (!el) {
        setShown(count)
        return
      }
      const m = measureRef.current(el)
      const widths = Array.from({ length: count }, (_, i) => m.widths[i] ?? 0)
      // The answer so far is passed on (round 3): a chip is shown again only with FIT_MARGIN to spare, so the fit settles.
      setShown(fitChips(widths, m.available, m.gap, m.plusWidth, shownNow.current).visible)
    }
    fitRef.current()
  })

  useLayoutEffect(() => {
    const el = line.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => fitRef.current())
    observer.observe(el)
    return () => observer.disconnect()
  }, [line, count])

  const visible = Math.min(shown, count)
  return { visible, hidden: count - visible }
}
