// ds-plan (docs/design/system.md §6): the chips of one Course row. Plain TypeScript, no React. Stub: the developer implements it.
import type { ChipKind, ChipStatus } from '../../../ui'
import type { IconName } from '../../../ui/icons'
import type { PlannedMeal } from '../types'
import type { PlanChip } from './chips'
import type { PhraseContext } from './phrase'

/** One chip of a row, with its look decided: `outline` is "Leftover for", `icon` an accent-coloured glyph on a why chip. */
export interface RowChip {
  key: string
  kind: ChipKind
  status?: ChipStatus
  outline?: boolean
  icon?: IconName
  label: string
}

/** What a row says about its meal, most important first (state, Leftover from, Leftover for, Bought, whole meal, why). */
export function rowChips(_meal: PlannedMeal, _ctx: PhraseContext, _whole?: PlanChip | null): RowChip[] {
  throw new Error('ds-plan: rowChips is not implemented')
}
