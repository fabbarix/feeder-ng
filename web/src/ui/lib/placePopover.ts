// XS: where a floating popover goes, from its trigger and the viewport (pure: no DOM, so it is unit-tested directly).
// The popover is `position: fixed` in the top layer, so these are viewport coordinates.

export interface PopoverRect {
  top: number
  left: number
  right: number
  bottom: number
}

export interface PlacePopoverInput {
  anchor: PopoverRect
  size: { width: number; height: number }
  viewport: { width: number; height: number }
  /** Space between the anchor and the popover. */
  gap?: number
  /** Minimum space kept between the popover and the viewport edges. */
  margin?: number
  /** Which edges line up: the popover's start with the anchor's start (default), or its end with the anchor's end (hf-recipes-filter). */
  align?: 'start' | 'end'
}

export interface PopoverPlacement {
  top: number
  left: number
  /** The room on the chosen side: the popover scrolls its list rather than leave the viewport. */
  maxHeight: number
  placement: 'below' | 'above'
}

/**
 * Below the anchor when the popover fits there, or when below has at least as much room as above; otherwise above.
 * Edges align with the anchor as `align` says, clamped inside the viewport by `margin`.
 */
export function placePopover({ anchor, size, viewport, gap = 4, margin = 8, align = 'start' }: PlacePopoverInput): PopoverPlacement {
  const roomBelow = viewport.height - anchor.bottom - gap - margin
  const roomAbove = anchor.top - gap - margin
  const below = roomBelow >= size.height || roomBelow >= roomAbove

  const wanted = align === 'end' ? anchor.right - size.width : anchor.left
  const left = clampLeft(wanted, size.width, viewport.width, margin)
  if (below) return { top: anchor.bottom + gap, left, maxHeight: roomBelow, placement: 'below' }
  const maxHeight = roomAbove
  return { top: anchor.top - gap - Math.min(size.height, maxHeight), left, maxHeight, placement: 'above' }
}

function clampLeft(left: number, width: number, viewportWidth: number, margin: number): number {
  const latest = viewportWidth - width - margin
  return Math.max(margin, Math.min(left, latest))
}
