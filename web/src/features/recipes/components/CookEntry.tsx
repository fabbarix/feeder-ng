import type { ReactNode } from 'react'

export interface CookEntryProps {
  batches: number
  onBatchesChange: (n: number) => void
  /** Yield of the Recipe (portions per Batch); the hint multiplies it with lib/cookEntry.batchPortions. */
  yieldValue: number
  onStart: () => void
}

/**
 * The Cook / Batch entry (QA B2, G2): a ui/Stepper named "Batches" (min/max from lib/cookEntry), the line
 * strings.cook.batchesHint and a primary Button "Start Cook Mode". Sticky above the navigation (CSS).
 */
export function CookEntry(props: CookEntryProps): ReactNode {
  void props
  return null
}
