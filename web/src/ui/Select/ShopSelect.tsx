import { useMemo } from 'react'
import { Select, type SelectFieldProps } from './Select'
import { shopOptions, type ShopChoice } from './options'

interface ShopSelectBase extends SelectFieldProps {
  shops: ShopChoice[]
}

/** Shops in the order given, each with a Storefront icon. With `clearLabel` ("Any Shop") the value may be null (WP3b). */
export type ShopSelectProps = ShopSelectBase &
  (
    | { value: number | null; onChange: (id: number) => void; clearLabel?: undefined }
    | { value: number | null; onChange: (id: number | null) => void; clearLabel: string }
  )

export function ShopSelect({ shops, value, onChange, clearLabel, ...field }: ShopSelectProps) {
  const options = useMemo(() => shopOptions(shops), [shops])
  return clearLabel === undefined ? (
    <Select<number> {...field} entityName="Shop" options={options} value={value} onChange={onChange} />
  ) : (
    <Select<number>
      {...field}
      entityName="Shop"
      options={options}
      value={value}
      onChange={onChange}
      clearLabel={clearLabel}
      onClear={() => onChange(null)}
    />
  )
}
