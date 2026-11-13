import { useMemo } from 'react'
import { Select, type SelectFieldProps } from './Select'
import { shopOptions, type ShopChoice } from './options'
import type { IconName } from '../icons'

interface ShopSelectBase extends SelectFieldProps {
  shops: ShopChoice[]
  /** a trailing "Add Shop" row for what was typed (any User may add a Shop) */
  onCreate?: (query: string) => void
  createLabel?: (query: string) => string
  /** DS-SHOP round 3: "chip" is opt-in (the Shop screen's toolbar); by default it is a normal labelled field. */
  appearance?: 'chip'
  /** an icon before the value (chip or field) */
  icon?: IconName
}

/** Shops in the order given, each with a Storefront icon. With `clearLabel` ("Any Shop") the value may be null (WP3b). */
export type ShopSelectProps = ShopSelectBase &
  (
    | { value: number | null; onChange: (id: number) => void; clearLabel?: undefined }
    | { value: number | null; onChange: (id: number | null) => void; clearLabel: string }
  )

export function ShopSelect({ shops, value, onChange, clearLabel, onCreate, createLabel, appearance, icon, ...field }: ShopSelectProps) {
  const options = useMemo(() => shopOptions(shops), [shops])
  return clearLabel === undefined ? (
    <Select<number> {...field} appearance={appearance} icon={icon} entityName="Shop" options={options} value={value} onChange={onChange} onCreate={onCreate} createLabel={createLabel} />
  ) : (
    <Select<number>
      {...field}
      appearance={appearance}
      icon={icon}
      entityName="Shop"
      options={options}
      value={value}
      onChange={onChange}
      clearLabel={clearLabel}
      onClear={() => onChange(null)}
      onCreate={onCreate}
      createLabel={createLabel}
    />
  )
}
