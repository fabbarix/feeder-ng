import type { ReactNode } from 'react'
import type { AllCookedRow } from '../lib/toConfirm'

export interface MarkAllCookedSheetProps {
  open: boolean
  onClose: () => void
  rows: AllCookedRow[]
  isLoading: boolean
  onLeftoverChange: (courseId: number, portions: number) => void
  onConfirm: () => void
  busy: boolean
  error: string | null
}

/**
 * STUB (CRS F). BottomSheet titled "Mark all Cooked": a row per Course with its name and Recipe; a fresh row has a
 * NumberField (spinbutton) named "<Course> Leftover portions" (0 to maxLeftover, half steps) and the Use-by chip as in
 * MarkCookedSheet; a Leftover row says "Served from a Leftover. Nothing is taken from Stock." and has no field. The
 * footer holds one primary "Mark all Cooked" (disabled while busy or loading). An error shows as role=alert.
 */
export function MarkAllCookedSheet(_props: MarkAllCookedSheetProps): ReactNode {
  return null
}
