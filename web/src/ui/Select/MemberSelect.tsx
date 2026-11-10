import type { ReactNode } from 'react'
import type { SelectFieldProps } from './Select'
import type { MemberChoice } from './options'

export interface MemberSelectProps extends SelectFieldProps {
  members: MemberChoice[]
  values: number[]
  onChange: (ids: number[]) => void
}

/** STUB (WP4 designer). Multi-select with avatars. */
export function MemberSelect(_props: MemberSelectProps): ReactNode {
  throw new Error('not implemented')
}
