// DS-SHOP (docs/design/system.md §3): the sheet a row opens: what the Line is (quantity, pack, estimated cost, the full
// "not marked Cooked yet" sentence) and its rare actions. The tick stays on the row. Render only.
import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import type { LineAction } from '../lib/rows'
import type { ListEntry } from '../lib/lines'
import { shopStrings } from '../strings'

export interface LineSheetProps {
  entry: ListEntry | null
  actions: LineAction[]
  onAction: (action: LineAction) => void
  onClose: () => void
}

const labels: Record<Exclude<LineAction, 'delete'>, string> = {
  'mark-it': shopStrings.markIt,
  'not-needed': shopStrings.notNeeded,
  'needed-after-all': shopStrings.neededAfterAll,
}

export function LineSheet({ entry, actions, onAction, onClose }: LineSheetProps) {
  if (!entry) return null
  const isLine = entry.kind === 'line' && !entry.ticked
  return (
    <BottomSheet open onClose={onClose} title={entry.title}>
      <div className="shop-line-sheet">
        {entry.quantityText ? <p className="shop-line-sheet__quantity">{entry.quantityText}</p> : null}
        {entry.packLine ? <p className="shop-line-sheet__pack">{entry.packLine}</p> : null}
        {isLine ? (
          <div className="shop-line-sheet__cost">
            <p className="shop-line-sheet__caption">{shopStrings.estimated}</p>
            <p className="shop-line-sheet__amount">{entry.estimatedCost ?? shopStrings.noPrice}</p>
          </div>
        ) : null}
        {entry.hint ? <p className="shop-line-sheet__hint">{entry.hint}</p> : null}
        {actions.length > 0 ? (
          <div className="shop-line-sheet__actions">
            {actions.map((action) =>
              action === 'delete' ? (
                <Button key={action} variant="danger" aria-label={shopStrings.deleteExtra(entry.title)} onClick={() => onAction(action)}>
                  {shopStrings.delete}
                </Button>
              ) : (
                <Button key={action} variant="secondary" onClick={() => onAction(action)}>
                  {labels[action]}
                </Button>
              ),
            )}
          </div>
        ) : null}
      </div>
    </BottomSheet>
  )
}
