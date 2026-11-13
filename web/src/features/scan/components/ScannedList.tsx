// SR4: the Scanned list: one ScannedRow per Product (newest first, as the rows are given), the empty state, and a footer
// slot after the list (outside it). It holds which row is active: one at a time, cleared when another Product is scanned
// on top, and a tap on the active row clears it (shop-scan-proposals.md 13.3). Render only.
import { useState, type ReactNode } from 'react'
import { EmptyState } from '../../../ui/EmptyState'
import { ListGroup } from '../../../ui/ListRow'
import type { UnitSystem } from '../../../lib/units'
import type { JustScanned } from '../hooks/useJustScanned'
import type { ScannedRow as Row } from '../lib/scannedList'
import { scanStrings } from '../strings'
import { ScannedRow } from './ScannedRow'

export interface ScannedListProps {
  rows: Row[]
  currency: string
  system: UnitSystem
  /** the key of the row whose Price entry is open, or null */
  pricingKey: string | null
  onPrice: (key: string) => void
  onIncrement: (key: string) => void
  onDecrement: (key: string) => void
  onRemove: (key: string) => void
  footer?: ReactNode
  /** the row a scan just put on top, which washes briefly */
  justScanned?: JustScanned | null
}

export function ScannedList({ rows, currency, system, pricingKey, onPrice, onIncrement, onDecrement, onRemove, footer, justScanned }: ScannedListProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  // A scan of another Product puts its row on top: the active row is cleared. A rescan (the active row moves up) keeps it.
  const top = rows[0]?.key ?? null
  const [seenTop, setSeenTop] = useState(top)
  if (top !== seenTop) {
    setSeenTop(top)
    if (top !== activeKey) setActiveKey(null)
  }

  return (
    <>
      {rows.length === 0 ? (
        <EmptyState title={scanStrings.nothingScanned} description={scanStrings.nothingScannedHint} />
      ) : (
        <ListGroup label={scanStrings.scannedListLabel}>
          {rows.map((row) => (
            <ScannedRow
              key={row.key}
              row={row}
              currency={currency}
              system={system}
              active={activeKey === row.key}
              pricing={pricingKey === row.key}
              {...(justScanned?.key === row.key ? { fresh: justScanned.pulse } : {})}
              onActivate={() => setActiveKey((current) => (current === row.key ? null : row.key))}
              onPrice={() => onPrice(row.key)}
              onIncrement={() => onIncrement(row.key)}
              onDecrement={() => onDecrement(row.key)}
              onRemove={() => onRemove(row.key)}
            />
          ))}
        </ListGroup>
      )}
      {footer}
    </>
  )
}
