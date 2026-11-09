import type { ReactNode } from 'react'
import type { CookPreview } from '../types'

export interface MarkCookedSheetProps {
  open: boolean
  onClose: () => void
  preview: CookPreview | null
  isLoading: boolean
  leftover: number
  onLeftoverChange: (next: number) => void
  onConfirm: () => void
  onNotCooked: () => void
  busy: boolean
  error: string | null
}

/**
 * "Mark as Cooked": shows the Recipe, what the Batches make against what is needed, and (for a freshly cooked meal) a
 * ± Stepper for the Leftover portions in half steps with the Use-by it would get. "Not cooked" is the other way out.
 */
export function MarkCookedSheet(props: MarkCookedSheetProps): ReactNode {
  void props
  return null
}
