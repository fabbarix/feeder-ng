import type { ReactNode } from 'react'
import { Checkbox, ListGroup, ListRow, NumberField } from '../../../ui'
import type { LineView } from '../lib/usedFrom'
import { usedFromStrings } from '../usedFromStrings'
import './usedFrom.css'

export interface UsedFromConflictView {
  lotId: number
  message: string
}

export interface UsedFromSectionProps {
  summary: string
  lines: LineView[]
  expanded: boolean
  onToggleExpanded: () => void
  onToggle: (ingredientId: number, lotId: number, on: boolean) => void
  /** `null` when the amount is cleared: the pick is removed. */
  onAmount: (ingredientId: number, lotId: number, amount: number | null) => void
  /** Cross-Course conflicts (Mark all Cooked), one per over-picked Lot, shown outside the Lot rows. */
  conflicts?: UsedFromConflictView[]
}

/** The collapsed "Used from" row of a Cooked sheet and its panel. Renders view models; no logic. */
export function UsedFromSection({ summary, lines, expanded, onToggleExpanded, onToggle, onAmount, conflicts = [] }: UsedFromSectionProps): ReactNode {
  return (
    <div className="used-from">
      <ListGroup label={usedFromStrings.title}>
        <ListRow
          title={usedFromStrings.title}
          meta={summary}
          onToggle={onToggleExpanded}
          expanded={expanded}
          panel={<UsedFromPanel lines={lines} onToggle={onToggle} onAmount={onAmount} />}
        />
      </ListGroup>
      {conflicts.map((conflict) => (
        <p key={conflict.lotId} role="alert" className="used-from__conflict">
          {conflict.message}
        </p>
      ))}
    </div>
  )
}

interface PanelProps {
  lines: LineView[]
  onToggle: UsedFromSectionProps['onToggle']
  onAmount: UsedFromSectionProps['onAmount']
}

function UsedFromPanel({ lines, onToggle, onAmount }: PanelProps) {
  return (
    <div className="used-from__panel">
      {lines.map((line) => (
        <div key={line.ingredientId} className="used-from__line">
          <p>{line.title}</p>
          {line.empty ? <p className="used-from__message">{line.empty}</p> : null}
          {line.lots.map((lot) => (
            <div key={lot.lotId} className="used-from__lot">
              <Checkbox label={lot.label} description={lot.meta} checked={lot.picked} onChange={(on) => onToggle(line.ingredientId, lot.lotId, on)} />
              {lot.picked ? (
                <NumberField
                  label={lot.amountLabel}
                  value={lot.amount}
                  min={0}
                  max={lot.max}
                  unit={lot.unit}
                  onChange={(amount) => onAmount(line.ingredientId, lot.lotId, amount)}
                />
              ) : null}
            </div>
          ))}
          {line.message ? <p className="used-from__message">{line.message}</p> : null}
        </div>
      ))}
    </div>
  )
}
