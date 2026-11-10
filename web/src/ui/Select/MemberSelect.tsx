import { useMemo } from 'react'
import { MultiSelect, Select } from './Select'
import type { SelectFieldProps } from './Select'
import { memberOptions, type MemberChoice } from './options'

interface MemberSelectBase extends SelectFieldProps {
  members: MemberChoice[]
}

/** Several Members (default), or exactly one with `single` (then `value`/`onChange` replace `values`/`onChange`). */
export type MemberSelectProps = MemberSelectBase &
  (
    | { single?: false; values: number[]; onChange: (ids: number[]) => void }
    | { single: true; value: number | null; onChange: (id: number) => void }
  )

/** Members, each with an Avatar. */
export function MemberSelect(props: MemberSelectProps) {
  const { members, ...rest } = props
  const options = useMemo(() => memberOptions(members), [members])
  if (rest.single) {
    const { single: _single, value, onChange, ...field } = rest
    return <Select<number> {...field} entityName="Member" options={options} value={value} onChange={onChange} />
  }
  const { single: _single, values, onChange, ...field } = rest
  return <MultiSelect<number> {...field} entityName="Member" options={options} values={values} onChange={onChange} />
}
