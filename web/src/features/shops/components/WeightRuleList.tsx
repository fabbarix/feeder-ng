import type { ShopRule } from '../types'

export interface WeightRuleListProps {
  rules: ShopRule[]
  currency: string
  isAdmin: boolean
  onEdit: (rule: ShopRule) => void
  onDelete: (rule: ShopRule) => void
  onAdd: () => void
}

/** One row per rule: "21 · item 3-7 · value 8-12 · weight in kg, 3 decimals" (price: "price in USD minor units"). Admin-only actions. */
export function WeightRuleList(props: WeightRuleListProps): never {
  void props
  throw new Error('TODO')
}
