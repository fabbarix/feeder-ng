import type { ReactNode } from 'react'
import type { FieldSize } from './Field'
import { NumberField } from './NumberField'
import { Select } from '../Select/Select'
import { YIELD_UNITS } from './yieldUnits'
import './Field.css'

export interface YieldFieldProps {
  /** The amount; null = blank. */
  amount: number | null
  /** The unit; '' = none chosen. */
  unit: string
  onAmountChange: (amount: number | null) => void
  onUnitChange: (unit: string) => void
  amountLabel?: string
  unitLabel?: string
  amountError?: string
  unitError?: string
  /** The units to offer (default: YIELD_UNITS). */
  units?: readonly string[]
  size?: FieldSize
}

/**
 * The Yield of a Base recipe or a Batch as one field pair: an amount (a NumberField) and its unit (a Select). Shared by the Import Review's
 * convert dialog and file yield, and the Recipe editor. Renders the two fields only; the caller lays them out (a FieldRow or a flex row).
 */
export function YieldField({
  amount,
  unit,
  onAmountChange,
  onUnitChange,
  amountLabel = 'Yield',
  unitLabel = 'Yield unit',
  amountError,
  unitError,
  units = YIELD_UNITS,
  size = 'xs',
}: YieldFieldProps): ReactNode {
  return (
    <>
      <NumberField size={size} label={amountLabel} value={amount} onChange={onAmountChange} error={amountError} />
      <Select size={size} label={unitLabel} options={units.map((u) => ({ value: u, label: u }))} value={unit || null} onChange={onUnitChange} error={unitError} />
    </>
  )
}
