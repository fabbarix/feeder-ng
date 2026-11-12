import type { ReactNode } from 'react'
import type { LineView } from '../lib/usedFrom'

export interface UsedFromSectionProps {
  summary: string
  lines: LineView[]
  expanded: boolean
  onToggleExpanded: () => void
  onToggle: (ingredientId: number, lotId: number, on: boolean) => void
  onAmount: (ingredientId: number, lotId: number, amount: number) => void
  /** Cross-Course conflict messages (Mark all Cooked). */
  conflicts?: string[]
}

/** The collapsed "Used from" row of a Cooked sheet and its panel. Renders view models; no logic. */
export function UsedFromSection(_props: UsedFromSectionProps): ReactNode {
  return null
}
