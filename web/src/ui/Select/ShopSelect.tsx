import type { ReactNode } from 'react'
import type { SelectFieldProps } from './Select'
import type { ShopChoice } from './options'

export interface ShopSelectProps extends SelectFieldProps {
  shops: ShopChoice[]
  value: number | null
  onChange: (id: number) => void

}

/** STUB (WP4 designer). Thin domain wrapper over Select: maps data with options.tsx, no fetching. */
export function ShopSelect(_props: ShopSelectProps): ReactNode {
  throw new Error('not implemented')
}
