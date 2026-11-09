import type { ShoppingSummary } from '../types'

export interface CelebrationTileProps {
  summary: ShoppingSummary
  currency: string
}

/**
 * "Shopping list complete" (functional spec §10.1): an accent Tile, role="status", with the heading, "<n> items"
 * (singular "1 item"), "<$ amount> spent" and "<n> Stock Lots added" ("1 Stock Lot"). The celebration animation is
 * a CSS class set only when the User does not prefer reduced motion (lib/motion prefersReducedMotion): with reduced
 * motion the tile has no `data-celebrate` attribute. Stub until implemented.
 */
export function CelebrationTile(props: CelebrationTileProps) {
  void props
  return null
}
