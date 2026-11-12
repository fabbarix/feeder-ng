import { useEffect, type RefObject } from 'react'

/** The custom property the sticky action bar publishes on the document root (read by Toast.css and the scroll padding). */
export const STICKY_BAR_CLEARANCE = '--sticky-bar-clearance'

/**
 * FU-1: publishes the rendered height of the sticky action bar `ref` is attached to as `--sticky-bar-clearance` on the document
 * root, so a toast (and a focused field, via scroll-padding) clears the bar's real height. The height varies per page and width
 * (one row or two stacked rows on a phone), so it is measured, not assumed. Without ResizeObserver the stylesheet default stands.
 * On unmount the property is removed again, so the CSS default applies to the next page.
 */
export function useStickyBarClearance(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const root = document.documentElement
    const publish = () => root.style.setProperty(STICKY_BAR_CLEARANCE, `${el.offsetHeight}px`)
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    publish()
    return () => {
      observer.disconnect()
      root.style.removeProperty(STICKY_BAR_CLEARANCE)
    }
  }, [ref])
}
