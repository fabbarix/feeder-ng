// B9-34 (SSP-01): the Change sheet "Garlic: how much?". TEST-AUTHOR STUB: the developer writes it (the old "How much?" prefill form is gone:
// one tap ticks now). Props pinned by TickSheet.test.tsx.
import type { UnitSystem } from '../../../lib/units'
import type { BaseUnit } from '../types'

export interface TickSheetProps {
  open: boolean
  onClose: () => void
  name: string
  baseUnit: BaseUnit
  system: UnitSystem
  /** Base Units the viewer's tick added; 0 = none (the "Added when you ticked it" row is left out) */
  added: number
  /** ISO instant of that tick */
  tickedAt: string
  /** the Household's IANA zone */
  timeZone: string
  /** the pack (label as tickChoices words it) and what the Line needed; null = not offered */
  choices: { pack: { label: string; amount: number } | null; need: { amount: number } | null }
  /** Base Units for this tick: > 0 sets the amount, 0 is "Tick without adding" */
  onSubmit: (quantity: number) => void
}

export function TickSheet(_props: TickSheetProps) {
  return null
}
