import type { ReactNode } from 'react'
import type { Alternative, PlanSlot } from '../types'

export interface SwapSheetProps {
  open: boolean
  onClose: () => void
  /** The slot being swapped (its date words the why chips). */
  slot: PlanSlot | null
  alternatives: Alternative[]
  isLoading: boolean
  onPick: (recipeId: number) => void
}

/** Bottom sheet with the top 3 alternatives, each with its phrased why chips; choosing one pins it. */
export function SwapSheet(props: SwapSheetProps): ReactNode {
  void props
  return null
}
