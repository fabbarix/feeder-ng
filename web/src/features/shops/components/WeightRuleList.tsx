import { Button } from '../../../ui'
import { ruleSummary } from '../lib/shopBarcodeForm'
import { strings } from '../strings'
import type { ShopRule } from '../types'
import '../../products/products.css'

export interface WeightRuleListProps {
  rules: ShopRule[]
  currency: string
  isAdmin: boolean
  onEdit: (rule: ShopRule) => void
  onDelete: (rule: ShopRule) => void
  onAdd: () => void
}

/** One row per rule: "21 · item 3-7 · value 8-12 · weight in kg, 3 decimals" (price: "price in USD minor units"). Admin-only actions. */
export function WeightRuleList({ rules, currency, isAdmin, onEdit, onDelete, onAdd }: WeightRuleListProps) {
  return (
    <div className="pg__stack">
      {rules.length === 0 ? (
        <p className="pg__muted">{strings.noWeightRules}</p>
      ) : (
        <ul className="pg__list">
          {rules.map((r) => (
            <li key={r.id} className="pg__row pg__row--between">
              <span>{ruleSummary(r, currency)}</span>
              {isAdmin ? (
                <span className="pg__row">
                  <Button variant="tonal" onClick={() => onEdit(r)}>
                    {strings.editRule}
                  </Button>
                  <Button variant="ghost" onClick={() => onDelete(r)}>
                    {strings.deleteRule}
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {isAdmin ? (
        <Button variant="tonal" onClick={onAdd}>
          {strings.addRule}
        </Button>
      ) : null}
    </div>
  )
}
