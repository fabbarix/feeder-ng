import { useMemo } from 'react'
import { Select, type SelectFieldProps, type SelectFilter } from './Select'
import { productMeta, productOptions, soldAt, type ProductChoice } from './options'
import { selectStrings } from './strings'

export interface ProductSelectProps extends Omit<SelectFieldProps, 'label' | 'helper'> {
  /** Default "Product". */
  label?: string
  products: ProductChoice[]
  /** The Shop the "Sold at" group and filter are about. */
  shop?: { id: number; name: string }
  value: number | null
  onChange: (id: number) => void
}

/** "Sold at Coop · Supply · 40 pieces": what the chosen Product is (no "Sold at" for a Product not sold there). */
export function productHelper(p: ProductChoice | undefined, shop?: { id: number; name: string }): string | undefined {
  if (!p) return undefined
  const parts = [soldAt(p, shop?.id) && shop ? selectStrings.soldAt(shop.name) : undefined, productMeta(p)].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

/**
 * B9-30 (SET-01): the crafted Product Select. Every Product, searchable, grouped "Sold at <Shop>" first, with the filters
 * "Sold at <Shop>", and "Food" and "Supplies" when the Products say which they are. The helper names what was chosen.
 */
export function ProductSelect({ label = selectStrings.product, products, shop, value, onChange, ...field }: ProductSelectProps) {
  const options = useMemo(() => productOptions(products, shop), [products, shop])
  const filters = useMemo<SelectFilter<number>[]>(() => {
    const byId = new Map(products.map((p) => [p.id, p]))
    const out: SelectFilter<number>[] = []
    if (shop) out.push({ id: 'sold-at', label: selectStrings.soldAt(shop.name), predicate: (o) => soldAt(byId.get(o.value) ?? { id: 0, name: '' }, shop.id) })
    if (products.some((p) => p.supply !== undefined)) {
      out.push({ id: 'food', label: selectStrings.food, predicate: (o) => byId.get(o.value)?.supply !== true })
      out.push({ id: 'supplies', label: selectStrings.supplies, predicate: (o) => byId.get(o.value)?.supply === true })
    }
    return out
  }, [products, shop])
  const helper = productHelper(products.find((p) => p.id === value), shop)
  return (
    <Select<number>
      {...field}
      label={label}
      helper={helper}
      entityName={selectStrings.productEntity}
      options={options}
      filters={filters}
      searchable
      value={value}
      onChange={onChange}
    />
  )
}
