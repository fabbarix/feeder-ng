import type { ReactNode } from 'react'
import type { SelectFieldProps } from './Select'
import type { MealSlotChoice } from './options'

export interface MealSlotSelectProps extends SelectFieldProps {
  slots: MealSlotChoice[]
  value: number | null
  onChange: (id: number) => void

}

/** STUB (WP4 designer). Thin domain wrapper over Select: maps data with options.tsx, no fetching. */
export function MealSlotSelect(_props: MealSlotSelectProps): ReactNode {
  throw new Error('not implemented')
}
