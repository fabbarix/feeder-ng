import type { ReactNode } from 'react'
import type { ImportResult as ImportResultData, Plan } from '../types'

export interface ImportResultProps {
  result: ImportResultData
  /** The plan the import was confirmed with: it names the file's Recipes, the created Ingredients and the answered units. */
  plan: Plan
  onImportMore: () => void
}

/** B9-28 (RX-01): stub, not built yet. See ImportResult.test.tsx. */
export function ImportResult(_props: ImportResultProps): ReactNode {
  return null
}
