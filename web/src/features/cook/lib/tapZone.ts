// SHORT-01, decision SHORT 3: the tap-or-scroll threshold of the Step tile's tap zones. Plain TypeScript, no React.
export const TAP_SLOP_PX = 10

/** A pointer that went down at `down` and came up at `up` made a tap when it moved less than 10 px (straight-line). */
export function isTap(down: { x: number; y: number }, up: { x: number; y: number }): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) < TAP_SLOP_PX
}

/**
 * SHORT-01, decision SHORT 3: what a click on the Step tile does. `down` is where the pointer went down (null for a keyboard or
 * assistive click, judged by position alone); a press that moved 10 px or more was a scroll, and a click while text is selected was
 * a selection: neither turns the Step. A click on a control inside the tile is the control's (the caller passes `onControl`).
 */
export function tileTap(
  click: { x: number; y: number },
  down: { x: number; y: number } | null,
  rect: { left: number; width: number },
  opts: { onControl: boolean; selecting: boolean },
): 'back' | 'next' | null {
  if (opts.onControl || opts.selecting) return null
  if (down && !isTap(down, click)) return null
  if (!(rect.width > 0)) return null
  if (click.x < rect.left || click.x > rect.left + rect.width) return null
  return click.x - rect.left < rect.width / 2 ? 'back' : 'next'
}
