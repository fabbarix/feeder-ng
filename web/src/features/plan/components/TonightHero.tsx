import type { ReactNode } from 'react'
import type { PlanSlot, SlotKey } from '../types'
import '../plan.css'

export interface TonightHeroProps {
  /** From lib/days heroMeal; its meal is planned. */
  slot: PlanSlot
  now: Date
  /** Open Cook Mode (Today routes to lib/cook cookPath). */
  onCook: (key: SlotKey) => void
  /** "Yes, Cooked": mark Cooked with the planned Leftover portions in one tap. */
  onYesCooked: (key: SlotKey) => void
  /** "Adjust": open the Mark as Cooked sheet. */
  onAdjust: (key: SlotKey) => void
  /** True while a Yes, Cooked is being saved. */
  busy?: boolean
}

/**
 * The Today hero (ui-fix-plan 2.1, 2.2, 5.1): a full-width accent Tile (variant hero). Before the slot time: overline
 * "DINNER · 19:30" with "start 18:45" when known, the Recipe name, up to 2 why chips, a primary Cook button
 * "Cook · 45 min", a photo thumb when there is one. After the slot time (lib/hero heroPhase): "<Recipe> cooked?" with
 * primary "Yes, Cooked" and secondary "Adjust". The Cook button is the only primary in the tile.
 */
export function TonightHero(_props: TonightHeroProps): ReactNode {
  throw new Error('not implemented (WP6)')
}
