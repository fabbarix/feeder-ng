import { useMemo } from 'react'
import { MultiSelect } from './Select'
import type { SelectFieldProps } from './Select'
import { memberOptions, type MemberChoice } from './options'

export interface MemberSelectProps extends SelectFieldProps {
  members: MemberChoice[]
  values: number[]
  onChange: (ids: number[]) => void
}

/** Several Members, each with an Avatar. */
export function MemberSelect({ members, values, onChange, ...field }: MemberSelectProps) {
  const options = useMemo(() => memberOptions(members), [members])
  return <MultiSelect<number> {...field} entityName="Member" options={options} values={values} onChange={onChange} />
}
