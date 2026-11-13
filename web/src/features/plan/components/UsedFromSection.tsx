import type { ReactNode } from 'react'
import { Checkbox, ListGroup, ListRow, NumberField } from '../../../ui'
import type { LineView } from '../lib/usedFrom'
import { usedFromStrings } from '../usedFromStrings'

export interface UsedFromSectionProps {
  summary: string
  lines: LineView[]
  expanded: boolean
  onToggleExpanded: () => void
  onToggle: (ingredientId: number, lotId: number, on: boolean) => void
  onAmount: (ingredientId: number, lotId: number, amount: number) => void
  /** Cross-Course conflict messages (Mark all Cooked). */
  conflicts?: string[]
}

/** The collapsed "Used from" row of a Cooked sheet and its panel. Renders view models; no logic. */
export function UsedFromSection({ summary, lines, expanded, onToggleExpanded, onToggle, onAmount, conflicts = [] }: UsedFromSectionProps): ReactNode {
  return (
    <>
      <ListGroup label={usedFromStrings.title}>
        <ListRow
          title={usedFromStrings.title}
          meta={summary}
          onToggle={onToggleExpanded}
          expanded={expanded}
          panel={<UsedFromPanel lines={lines} onToggle={onToggle} onAmount={onAmount} />}
        />
      </ListGroup>
      {conflicts.map((message) => (
        <p key={message} role="alert">
          {message}
        </p>
      ))}
    </>
  )
}

interface PanelProps {
  lines: LineView[]
  onToggle: UsedFromSectionProps['onToggle']
  onAmount: UsedFromSectionProps['onAmount']
}

function UsedFromPanel({ lines, onToggle, onAmount }: PanelProps) {
  return (
    <div>
      {lines.map((line) => (
        <div key={line.ingredientId}>
          <p>{line.title}</p>
          {line.empty ? <p>{line.empty}</p> : null}
          {line.lots.map((lot) => (
            <div key={lot.lotId}>
              <Checkbox label={lot.label} description={lot.meta} checked={lot.picked} onChange={(on) => onToggle(line.ingredientId, lot.lotId, on)} />
              {lot.picked ? (
                <NumberField
                  label={lot.amountLabel}
                  value={lot.amount}
                  min={0}
                  max={lot.max}
                  onChange={(amount) => {
                    if (amount !== null) onAmount(line.ingredientId, lot.lotId, amount)
                  }}
                />
              ) : null}
            </div>
          ))}
          {line.message ? <p>{line.message}</p> : null}
        </div>
      ))}
    </div>
  )
}
