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
 * stylesheet default stands. A bar that does not float (`enabled` false) publishes nothing. StrictMode-safe: each effect run registers its own entry and removes it on cleanup.
 */
export function useStickyBarClearance(ref: RefObject<HTMLElement | null>, enabled = true): void {
  useEffect(() => {
    const el = ref.current
    if (!enabled || !el || typeof ResizeObserver === 'undefined') return
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
  }, [ref, enabled])
}

/** The focus ring's reach outside a field frame: the 3 px outline at its 2 px offset. */
const RING_PX = 5

/** Whether a field frame, grown by its focus ring, reaches below the sticky bar's top edge (touching is not crossing). */
export function ringCrossesBarTop({ frameBottom, barTop, ring = RING_PX }: { frameBottom: number; barTop: number; ring?: number }): boolean {
  return frameBottom + ring > barTop
}

/**
 * B9-19 (SHORT-04): while the bar floats, a control that takes focus with its ring under the bar is scrolled clear of it. The
 * browser scrolls the caret of a textarea, not its box, and leaves a partly visible control where it is, so scroll-padding alone
 * leaves the frame's bottom and ring under the bar. The field frame (`.ui-field__control`) is scrolled, else the control itself;
 * `scroll-padding-block-end` then decides where it stops. Focus inside the bar never scrolls.
 */
export function useScrollFocusClearOfBar(ref: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const onFocusIn = (e: FocusEvent) => {
      const bar = ref.current
      const target = e.target
      if (!bar || !(target instanceof Element) || bar.contains(target)) return
      const frame = target.closest('.ui-field__control') ?? target
      if (!ringCrossesBarTop({ frameBottom: frame.getBoundingClientRect().bottom, barTop: bar.getBoundingClientRect().top })) return
      frame.scrollIntoView?.({ block: 'nearest' })
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [ref, enabled])
}
