import { useEffect, type RefObject } from 'react'

/** The custom property the sticky action bar publishes on the document root (read by Toast.css and the scroll padding). */
export const STICKY_BAR_CLEARANCE = '--sticky-bar-clearance'

interface MountedBar {
  height: number
}

/** Every mounted sticky action bar and its last measured height. Module-level: several bars may be mounted at once. */
const mounted = new Set<MountedBar>()

/**
 * Publishes the largest height of the mounted bars as `--sticky-bar-clearance` on the document root. The property is written
 * only when its value changes, and removed when the last bar unmounts (the stylesheet default applies again).
 */
function publish(): void {
  const root = document.documentElement
  if (mounted.size === 0) {
    root.style.removeProperty(STICKY_BAR_CLEARANCE)
    return
  }
  const value = `${Math.max(...[...mounted].map((bar) => bar.height))}px`
  if (root.style.getPropertyValue(STICKY_BAR_CLEARANCE) !== value) root.style.setProperty(STICKY_BAR_CLEARANCE, value)
}

/**
 * FU-1: publishes the rendered height of the sticky action bar `ref` is attached to. The height varies per page and width (one
 * row or two stacked rows on a phone), so it is measured, not assumed. Without ResizeObserver nothing is published and the
 * stylesheet default stands. StrictMode-safe: each effect run registers its own entry and removes it on cleanup.
 */
export function useStickyBarClearance(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const bar: MountedBar = { height: el.offsetHeight }
    mounted.add(bar)
    publish()
    const observer = new ResizeObserver(() => {
      bar.height = el.offsetHeight
      publish()
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      mounted.delete(bar)
      publish()
    }
  }, [ref])
}
