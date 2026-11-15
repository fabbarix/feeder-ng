import type { ReactNode } from 'react'

export interface ImportBarProps {
  /** Recipes the import will save (not skipped). */
  recipes: number
  /** Open questions. */
  questions: number
  busy: boolean
  /** Moves focus to the first open question after the one that has focus (wraps around). */
  onNext: () => void
  onImport: () => void
}

/** B9-28 (RX-01): stub, not built yet. It replaces ConfirmTile. See ImportBar.test.tsx. */
export function ImportBar(_props: ImportBarProps): ReactNode {
  return null
}
