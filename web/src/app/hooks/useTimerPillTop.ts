// B9-55 (int2 finding 2): below 64em, on a page with a sticky action bar in a viewport where the bottom stack (the bottom bar, the
// action bar and the floating pill) would pass the 35 % chrome budget, the pill goes to the top bar, between the brand and Your menu
// (app/pillDock pillTopDock). Measured on layout, resize and DOM changes (the bar comes and goes with the page); null (the pill
// floats as usual) otherwise. Not used while the pill docks in a short viewport's Save bar (useTimerPillDock).
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { pillTopDock } from '../pillDock'

const NARROW = '(width < 64em)'
const GAP = 12
/** Until the floating pill has been measured: the page gutter and the 16 px it floats above the action bar (ShellTimers.css). */
const LIFT = 20

/** `lift`: how far the floating pill sits above the bar, measured while it floats (in the top bar its own box says nothing about it). */
function measure(pill: HTMLElement, lift: { current: number }, inTop: boolean): { x: number; maxWidth: number } | null {
  if (!window.matchMedia?.(NARROW).matches) return null
  const bar = document.querySelector<HTMLElement>('.sticky-action-bar')
  const brand = document.querySelector<HTMLElement>('.top-bar__brand')
  const menu = document.querySelector<HTMLElement>('.your-menu-button')
  if (!bar || !brand || !menu || getComputedStyle(bar).position !== 'sticky') return null
  const b = bar.getBoundingClientRect()
  if (b.width <= 0 || b.height <= 0) return null
  const p = pill.getBoundingClientRect()
  if (!inTop && p.height > 0) lift.current = Math.max(0, b.top - p.bottom)
  return pillTopDock({
    barTop: b.top,
    pillHeight: p.height,
    viewportHeight: window.innerHeight,
    brandRight: brand.getBoundingClientRect().right,
    menuLeft: menu.getBoundingClientRect().left,
    gap: GAP,
    lift: lift.current,
  })
}

/** Where the pill sits in the top bar, or null. `active` is false while there is no pill or it docks in the Save bar. */
export function useTimerPillTop(pill: RefObject<HTMLElement | null>, active: boolean): { x: number; maxWidth: number } | null {
  const [top, setTop] = useState<{ x: number; maxWidth: number } | null>(null)
  const lift = useRef(LIFT)
  const inTop = useRef(false)
  useLayoutEffect(() => {
    if (!active || typeof window === 'undefined') {
      setTop(null)
      return
    }
    let frame = 0
    const update = () => {
      frame = 0
      const el = pill.current
      const next = el ? measure(el, lift, inTop.current) : null
      inTop.current = next !== null
      setTop((prev) => (prev?.x === next?.x && prev?.maxWidth === next?.maxWidth ? prev : next))
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('resize', schedule)
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule)
    observer?.observe(document.body, { childList: true, subtree: true })
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      observer?.disconnect()
    }
  }, [active, pill])
  return top
}
