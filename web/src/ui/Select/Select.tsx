import type { ReactNode } from 'react'
import type { SelectOption } from './lib'

export interface SelectFieldProps {
  label: string
  helper?: string
  error?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
}

export interface SelectSort<V extends string | number = string> {
  id: string
  label: string
  compare: (a: SelectOption<V>, b: SelectOption<V>) => number
}

export interface SelectFilter<V extends string | number = string> {
  id: string
  label: string
  predicate: (option: SelectOption<V>) => boolean
}

interface SelectBaseProps<V extends string | number> extends SelectFieldProps {
  options: SelectOption<V>[]
  /** Singular entity for copy: "No Recipe matches 'xyz'", search label "Search Recipe". Default: the label. */
  entityName?: string
  /** Default: shown when there are more than 8 options. */
  searchable?: boolean
  filters?: SelectFilter<V>[]
  /** The first is the default. A sort IconButton "Sort: <label>" cycles through them. */
  sorts?: SelectSort<V>[]
  /** Adds a trailing "create" row when the query is non-empty and matches no label exactly. */
  onCreate?: (query: string) => void
  createLabel?: (query: string) => string
}

export interface SelectProps<V extends string | number = string> extends SelectBaseProps<V> {
  value: V | null
  onChange: (value: V) => void
}

export interface MultiSelectProps<V extends string | number = string> extends SelectBaseProps<V> {
  values: V[]
  onChange: (values: V[]) => void
}

/** STUB (WP4 designer). Combobox + listbox (popover from 768 px, bottom sheet below). */
export function Select<V extends string | number = string>(_props: SelectProps<V>): ReactNode {
  throw new Error('not implemented')
}

/** STUB. Same, but picking toggles and the list stays open. */
export function MultiSelect<V extends string | number = string>(_props: MultiSelectProps<V>): ReactNode {
  throw new Error('not implemented')
}
