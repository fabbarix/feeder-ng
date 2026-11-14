import { Button, Cluster, IconButton, ListGroup, ListRow, Muted, Stack } from '../../../ui'
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

/** One row per rule: "prefix 21 · item digits 3-7 · value digits 8-12 · weight in kg, 3 decimals". Admin-only actions. */
export function WeightRuleList({ rules, currency, isAdmin, onEdit, onDelete, onAdd }: WeightRuleListProps) {
  return (
    <Stack>
      {rules.length === 0 ? (
        <Muted>{strings.noWeightRules}</Muted>
      ) : (
        <ListGroup label={strings.weightRulesTitle}>
          {rules.map((r) => (
            <ListRow
              key={r.id}
              title={ruleSummary(r, currency)}
              trailing={
                isAdmin ? (
                  <Cluster>
                    <IconButton icon="edit" label={strings.editRule} onClick={() => onEdit(r)} />
                    <IconButton icon="delete" label={strings.deleteRule} onClick={() => onDelete(r)} />
                  </Cluster>
                ) : undefined
              }
            />
          ))}
        </ListGroup>
      )}
      {isAdmin ? (
        <Button variant="secondary" onClick={onAdd}>
          {strings.addRule}
        </Button>
      ) : null}
    </Stack>
  )
}
