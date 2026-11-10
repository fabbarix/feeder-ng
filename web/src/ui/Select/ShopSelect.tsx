import { useMemo } from 'react'
import { Select, type SelectFieldProps } from './Select'
import { shopOptions, type ShopChoice } from './options'

export interface ShopSelectProps extends SelectFieldProps {
  shops: ShopChoice[]
  value: number | null
  onChange: (id: number) => void
}

/** Shops in the order given, each with a Storefront icon. */
export function ShopSelect({ shops, value, onChange, ...field }: ShopSelectProps) {
  const options = useMemo(() => shopOptions(shops), [shops])
  return <Select<number> {...field} entityName="Shop" options={options} value={value} onChange={onChange} />
}
