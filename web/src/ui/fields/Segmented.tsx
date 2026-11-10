import type { ReactNode } from 'react'
import type { IconName } from './Field'

export interface SegmentedOption<V extends string> {
  value: V
  label: string
  icon?: IconName
  disabled?: boolean
}

export interface SegmentedProps<V extends string> {
  /** Names the radiogroup. */
  label: string
  options: SegmentedOption<V>[]
  value: V
  onChange: (value: V) => void
  /** Hide the visible label (still the accessible name). */
  hideLabel?: boolean
}

/** STUB (WP4 designer). role=radiogroup of role=radio buttons with a roving tabindex. */
export function Segmented<V extends string>(_props: SegmentedProps<V>): ReactNode {
  throw new Error('not implemented')
}
