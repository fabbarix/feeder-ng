import { useMemo } from 'react'
import { Select, type SelectFieldProps } from './Select'
import { unitOptions, type UnitChoices } from './options'

export interface UnitSelectProps extends SelectFieldProps {
  units: UnitChoices
  value: string | null
  onChange: (unit: string) => void
  /** WP3b: forwarded to Select. Offers a create row for an unknown typed unit. */
  onCreate?: (query: string) => void
  /** WP3b: default `Use unit "<typed>"`. */
  createLabel?: (query: string) => string
}

/** Units grouped: Base Unit, Unit Conversions (with the conversion as meta), then the global Units. */
export function UnitSelect({ units, value, onChange, ...field }: UnitSelectProps) {
  const options = useMemo(() => unitOptions(units), [units])
  return <Select<string> {...field} entityName="Unit" options={options} value={value} onChange={onChange} />
}
