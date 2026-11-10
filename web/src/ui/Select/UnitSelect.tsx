import type { ReactNode } from 'react'
import type { SelectFieldProps } from './Select'
import type { UnitChoices } from './options'

export interface UnitSelectProps extends SelectFieldProps {
  units: UnitChoices
  value: string | null
  onChange: (unit: string) => void
}

/** STUB (WP4 designer). Grouped: Base Unit, Unit Conversions, Units. */
export function UnitSelect(_props: UnitSelectProps): ReactNode {
  throw new Error('not implemented')
}
