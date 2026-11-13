import type { ReactNode } from 'react'
import type { TakeOverAsk } from '../../../lib/baseRecipes/types'

export interface TakeOverDialogProps {
  /** null = closed. */
  ask: TakeOverAsk | null
  baseName: string
  onAnswer: (yes: boolean) => void
  /** Escape or backdrop: nothing is saved. */
  onCancel: () => void
}

/** BR-D: the take-over ask (ADR 0015 point 1). A Dialog built from takeOverDialog(): the Recipes and Stock named, "Yes" and "No" (Yes disabled with its reason when it cannot convert). */
export function TakeOverDialog(props: TakeOverDialogProps): ReactNode {
  void props
  return null
}
