import type { ReactNode } from 'react'
import type { IconName } from './Field'

export interface RadioCardOption<V extends string> {
  value: V
  title: string
  description?: string
  icon?: IconName
  disabled?: boolean
}

export interface RadioCardsProps<V extends string> {
  /** Group name (a visible legend). */
  label: string
  options: RadioCardOption<V>[]
  value: V
  onChange: (value: V) => void
  helper?: string
}

/** STUB (WP4 designer). Same radiogroup behaviour as Segmented, drawn as cards. */
export function RadioCards<V extends string>(_props: RadioCardsProps<V>): ReactNode {
  throw new Error('not implemented')
}
