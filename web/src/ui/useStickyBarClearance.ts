import { useEffect, type RefObject } from 'react'

/** The custom property the sticky action bar publishes on the document root (read by Toast.css and the scroll padding). */
export const STICKY_BAR_CLEARANCE = '--sticky-bar-clearance'

/**
 * B9-51: how far above its floating spot the bar sits while it is in flow on a page shorter than the viewport (it then ends the
 * form, higher than where it floats). Toast.css adds it to the region's lift, so a toast never covers the bar there either.
 */
export const STICKY_BAR_LIFT = '--sticky-bar-lift'

interface MountedBar {
  height: number
  /** px above the floating spot (0 while it floats or is off screen). */
  lift: number
}

/** Room for the tallest toast (a headline, a subline, a body and a row of actions) between a high bar and the toast's own spot. */
export const TOAST_ROOM_PX = 160

/**
 * B9-51: the distance from where the bar would float (its sticky `bottom` above the viewport's bottom edge) up to where it is, when
 * a toast at its usual spot (just above the floating spot) could cover it. 0 while the bar floats, below that spot, off screen or
 * leaving the top, and when it is so high that a toast fits under it (more than its height and TOAST_ROOM_PX above). Pure.
 */
export function barLift({ viewportHeight, top, bottom, stickyBottom }: { viewportHeight: number; top: number; bottom: number; stickyBottom: number }): number {
  if (!Number.isFinite(stickyBottom) || top < 0 || top >= viewportHeight) return 0
  const height = bottom - top
  const lift = Math.round(viewportHeight - stickyBottom - height - top)
  return lift > 0 && lift <= height + TOAST_ROOM_PX ? lift : 0
}

function measureLift(el: HTMLElement): number {
  const r = el.getBoundingClientRect()
  return barLift({ viewportHeight: window.innerHeight, top: r.top, bottom: r.bottom, stickyBottom: parseFloat(getComputedStyle(el).bottom) })
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
    root.style.removeProperty(STICKY_BAR_LIFT)
    return
  }
  const value = `${Math.max(...[...mounted].map((bar) => bar.height))}px`
  if (root.style.getPropertyValue(STICKY_BAR_CLEARANCE) !== value) root.style.setProperty(STICKY_BAR_CLEARANCE, value)
  const lift = Math.max(...[...mounted].map((bar) => bar.lift))
  if (lift === 0) root.style.removeProperty(STICKY_BAR_LIFT)
  else if (root.style.getPropertyValue(STICKY_BAR_LIFT) !== `${lift}px`) root.style.setProperty(STICKY_BAR_LIFT, `${lift}px`)
}

/**
 * FU-1: publishes the rendered height of the sticky action bar `ref` is attached to. The height varies per page and width (one
 * row or two stacked rows on a phone), so it is measured, not assumed. Without ResizeObserver nothing is published and the
 * stylesheet default stands. A bar that does not float (`enabled` false) publishes nothing. B9-51: it also publishes its lift
 * (STICKY_BAR_LIFT), measured again on scroll, resize and a change of the page's size. StrictMode-safe: each effect run registers its own entry and removes it on cleanup.
 */
export function useStickyBarClearance(ref: RefObject<HTMLElement | null>, enabled = true): void {
  useEffect(() => {
    const el = ref.current
    if (!enabled || !el || typeof ResizeObserver === 'undefined') return
    const bar: MountedBar = { height: el.offsetHeight, lift: measureLift(el) }
    mounted.add(bar)
    publish()
    const observer = new ResizeObserver(() => {
      bar.height = el.offsetHeight
      bar.lift = measureLift(el)
      publish()
    })
    observer.observe(el)
    // B9-51: the lift changes with scrolling and the viewport (a page that grows past the viewport lets the bar float).
    let frame = 0
    const onMove = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        bar.lift = measureLift(el)
        publish()
      })
    }
    window.addEventListener('scroll', onMove, { passive: true })
    window.addEventListener('resize', onMove)
    observer.observe(document.body)
    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onMove)
      window.removeEventListener('resize', onMove)
      mounted.delete(bar)
      publish()
    }
  }, [ref, enabled])
}

/** The focus ring's reach outside a field frame: the 3 px outline at its 2 px offset. */
const RING_PX = 5
/** The gap the scroll padding keeps between a focused ring and the bar (--space-1). */
const RING_GAP_PX = 4

/** Whether a field frame, grown by its focus ring, reaches below the sticky bar's top edge (touching is not crossing). */
export function ringCrossesBarTop({ frameBottom, barTop, ring = RING_PX }: { frameBottom: number; barTop: number; ring?: number }): boolean {
  return frameBottom + ring > barTop
}

/**
 * The element that draws a focused control's ring: its field frame (`.ui-field__control`), the visual sibling of a visually hidden
 * input (the Checkbox's `input + .checkbox__box`), else the control itself.
 */
function ringOwner(target: Element): Element {
  const frame = target.closest('.ui-field__control')
  if (frame) return frame
  const sibling = target.nextElementSibling
  if (target.tagName === 'INPUT' && sibling && getComputedStyle(target).opacity === '0') return sibling
  return target
}

/**
 * B9-19 (SHORT-04): while the bar floats, a control that takes focus with its ring under the bar is scrolled clear of it. The
 * browser scrolls the caret of a textarea, not its box, and leaves a partly visible control where it is, so scroll-padding alone
 * leaves the frame's bottom and ring under the bar. A visual-viewport resize (the keyboard coming up) checks the focused field again. The field frame (`.ui-field__control`) is scrolled, else the control itself;
 * `scroll-padding-block-end` then decides where it stops. Focus inside the bar never scrolls.
 */
export function useScrollFocusClearOfBar(ref: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const clear = (target: EventTarget | Element | null) => {
      const bar = ref.current
      if (!bar || !(target instanceof Element) || target === document.body || bar.contains(target)) return
      const frame = ringOwner(target)
      // The ring and the 4 px the scroll padding keeps between it and the bar: a ring that only touches the bar is scrolled too (P39).
      if (!ringCrossesBarTop({ frameBottom: frame.getBoundingClientRect().bottom, barTop: bar.getBoundingClientRect().top, ring: RING_PX + RING_GAP_PX })) return
      frame.scrollIntoView?.({ block: 'nearest' })
    }
    const onFocusIn = (e: FocusEvent) => clear(e.target)
    // The on-screen keyboard comes up after the focus: the bar then rides up onto it, so the focused field is checked again.
    const onViewport = () => clear(document.activeElement)
    const vv = globalThis.visualViewport
    document.addEventListener('focusin', onFocusIn)
    vv?.addEventListener('resize', onViewport)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      vv?.removeEventListener('resize', onViewport)
    }
  }, [ref, enabled])
}
