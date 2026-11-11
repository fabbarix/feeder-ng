// XS: floats a popover="manual" element above everything (top layer) and places it from its trigger. Works without the
// Popover API too: the element is still position: fixed and placed by script. Used by Select and DateField, so a dialog's
// overflow or stacking context cannot clip the list.
import { useEffect, useLayoutEffect, type RefObject } from 'react'
import { placePopover } from './placePopover'

type PopoverEl = HTMLElement & { showPopover?: () => void; hidePopover?: () => void }

/**
 * The `popover` attribute for a floating element: "manual" where the Popover API exists, so the browser shows it in the top
 * layer; none otherwise, because a UA stylesheet without the API may hide `[popover]` elements the script never shows.
 */
export function floatingPopoverAttr(): 'manual' | undefined {
  return typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function' ? 'manual' : undefined
}

/**
 * `open` shows the popover, places it under (or over) `anchor` and keeps it placed on scroll and resize. `display` is the
 * panel's own display: the UA hides every [popover] that is not :popover-open, so the shown element sets it inline (the
 * browser's own :popover-open rule does the same; engines without it, and jsdom, need this).
 */
export function useFloatingPopover(open: boolean, anchor: RefObject<HTMLElement | null>, popover: RefObject<HTMLElement | null>, display: 'block' | 'flex' = 'block'): void {
  // Show in the top layer; hide on close. The element is captured now because it is removed from the DOM on close.
  useLayoutEffect(() => {
    const el = popover.current as PopoverEl | null
    if (!open || !el) return
    if (typeof el.showPopover === 'function') {
      try {
        el.showPopover()
      } catch {
        // Already showing: nothing to do.
      }
    }
    el.style.display = display
    return () => {
      if (typeof el.hidePopover !== 'function') return
      try {
        el.hidePopover()
      } catch {
        // Already hidden or detached: nothing to do.
      }
    }
  }, [open])

  // Place after every render while open (the list can change size as the User types or filters).
  useLayoutEffect(() => {
    if (open) place(anchor.current, popover.current)
  })

  useEffect(() => {
    if (!open) return
    const onMove = () => place(anchor.current, popover.current)
    window.addEventListener('scroll', onMove, { capture: true, passive: true })
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, { capture: true })
      window.removeEventListener('resize', onMove)
    }
  }, [open, anchor, popover])
}

function place(anchorEl: HTMLElement | null, el: HTMLElement | null): void {
  if (!anchorEl || !el) return
  // Measure at natural height: a previous cap must not shrink the measurement.
  el.style.maxHeight = ''
  const a = anchorEl.getBoundingClientRect()
  const p = el.getBoundingClientRect()
  const placed = placePopover({
    anchor: { top: a.top, left: a.left, right: a.right, bottom: a.bottom },
    size: { width: p.width, height: p.height },
    viewport: { width: window.innerWidth, height: window.innerHeight },
  })
  el.style.position = 'fixed'
  el.style.top = `${placed.top}px`
  el.style.left = `${placed.left}px`
  el.style.maxHeight = `${placed.maxHeight}px`
  el.dataset.placement = placed.placement
}
