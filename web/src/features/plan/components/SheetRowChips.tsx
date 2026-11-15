import type { ReactNode } from 'react'
import { Chip } from '../../../ui'
import type { RowChip } from '../lib/rowChips'

/** B9-38 (PC-10): the chip line under a Recipe row of Swap or Choose a Recipe (the row's `below` slot); nothing without chips. */
export function SheetRowChips({ chips }: { chips: RowChip[] }): ReactNode {
  if (chips.length === 0) return null
  return (
    <div className="plan-sheet__chips">
      {chips.map((c) => (
        <Chip key={c.key} kind={c.kind} status={c.status} outline={c.outline} icon={c.icon} title={c.title}>
          {c.label}
        </Chip>
      ))}
    </div>
  )
}
