// Batch w3e (B9-48, still-used Ingredient at 375): an action row whose buttons do not fit on one line stacks them full width, the
// decision on top, instead of leaving each one alone and end-aligned on its own line. The row is measured as it lays out when not
// stacked (wrapped = a button starts lower than the first one); `data-stacked` is then set on the row. Re-measured when the panel
// resizes. No layout (jsdom): nothing is set.
import { useLayoutEffect, type RefObject } from 'react'

export function measureStacked(row: HTMLElement): boolean {
  row.removeAttribute('data-stacked')
  const kids = [...row.children].filter((c): c is HTMLElement => c instanceof HTMLElement)
  if (kids.length < 2) return false
  const top = kids[0]!.offsetTop
  const wrapped = kids.some((k) => k.offsetTop !== top)
  if (wrapped) row.setAttribute('data-stacked', '')
  return wrapped
}

export function useStackedActions(rowRef: RefObject<HTMLElement | null>, watchRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const row = rowRef.current
    if (!row) return
    measureStacked(row)
    const watched = watchRef.current
    if (!watched || typeof ResizeObserver === 'undefined') return
    let width = watched.clientWidth
    const ro = new ResizeObserver(() => {
      if (watched.clientWidth === width) return
      width = watched.clientWidth
      measureStacked(row)
    })
    ro.observe(watched)
    return () => ro.disconnect()
  })
}
