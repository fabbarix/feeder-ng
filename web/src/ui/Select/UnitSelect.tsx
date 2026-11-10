import { useMemo } from 'react'
import { Select, type SelectFieldProps } from './Select'
import { unitOptions, type UnitChoices } from './options'
import { selectStrings } from './strings'

export interface UnitSelectProps extends SelectFieldProps {
  units: UnitChoices
  value: string | null
  onChange: (unit: string) => void
  /** WP3b: offers a create row for a typed unit that does not exist yet; makes the list searchable. */
  onCreate?: (query: string) => void
  /** WP3b: default `Use unit "<typed>"`. */
  createLabel?: (query: string) => string
}

/** Units grouped: Base Unit, Unit Conversions (with the conversion as meta), then the global Units. */
export function UnitSelect({ units, value, onChange, onCreate, createLabel, ...field }: UnitSelectProps) {
  const options = useMemo(() => unitOptions(units), [units])
  return (
    <Select<string>
      {...field}
      entityName="Unit"
      options={options}
      value={value}
      onChange={onChange}
      onCreate={onCreate}
      createLabel={onCreate ? (createLabel ?? selectStrings.useUnit) : undefined}
    />
  )
}
