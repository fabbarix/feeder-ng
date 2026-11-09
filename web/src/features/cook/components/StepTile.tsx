import type { ReactNode } from 'react'
import type { CookStep } from '../types'

export interface StepTileProps {
  step: CookStep
  /** Tablet: the left half of the tile goes Back, the right half Next (lib/steps.tapAction). */
  tapZones?: boolean
  onBack: () => void
  onNext: () => void
  /** Formats one scaled use for display, e.g. "4 piece onion" (the User's unit system is the hook's business). */
  formatUse?: (use: CookStep['uses'][number]) => string
}

/**
 * The large step tile: `article` labelled "Step N of M" holding the Step text,
 * the scaled uses as a list ("4 piece onion" by default: quantity, unit, name),
 * the Step's photo when it has one, and on a Passive Step a note with its
 * duration. With tapZones a click calls onBack/onNext by tapAction on the
 * article's bounding box. Renders and wires events only.
 */
export function StepTile(_props: StepTileProps): ReactNode {
  return null
}
