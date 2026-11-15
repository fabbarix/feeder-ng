// PC-04, w4a review: in a short viewport (below 64em wide, under 500 px tall) a floating pill above the Save bar covers the page.
// While such a bar shows, the pill docks inside the bar's free start instead (app/pillDock), level with it. Measured on layout,
// resize, scroll and DOM changes (the bar comes and goes with the page); null (the pill floats as usual) when it does not fit.
import { useLayoutEffect, useState, type RefObject } from 'react'
import { pillDock } from '../pillDock'

export const SHORT_VIEWPORT = '(width < 64em) and (height < 31.25em)'
const PAD = 16

function measure(pill: HTMLElement): { x: number; y: number } | null {
  if (!window.matchMedia?.(SHORT_VIEWPORT).matches) return null
  const bar = document.querySelector<HTMLElement>('.sticky-action-bar')
  if (!bar || getComputedStyle(bar).position !== 'sticky') return null
  const b = bar.getBoundingClientRect()
  const controls = [...bar.querySelectorAll<HTMLElement>('button, a[href], [role="button"]')].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0)
  const controlsLeft = controls.length ? Math.min(...controls.map((r) => r.left)) : b.right
  const p = pill.getBoundingClientRect()
  return pillDock({ left: b.left, top: b.top, width: b.width, height: b.height }, controlsLeft, { width: p.width, height: p.height }, PAD, window.innerHeight)
}

/** Where the pill docks beside the Save bar, or null. `active` is false while there is no pill. */
export function useTimerPillDock(pill: RefObject<HTMLElement | null>, active: boolean): { x: number; y: number } | null {
  const [dock, setDock] = useState<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    if (!active || typeof window === 'undefined') {
      setDock(null)
      return
    }
    let frame = 0
    const update = () => {
      frame = 0
      const el = pill.current
      const next = el ? measure(el) : null
      setDock((prev) => (prev?.x === next?.x && prev?.y === next?.y ? prev : next))
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, { passive: true })
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule)
    observer?.observe(document.body, { childList: true, subtree: true })
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule)
      observer?.disconnect()
    }
  }, [active, pill])
  return dock
}
