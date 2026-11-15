// B9-40 (PC-03, SHORT-01, DS 3): the shared pieces of the Advance Steps of a Recipe cook and of the timeline: the one info line after
// the first Step, the chip of short landscape with its sheet, and the Advance Step rows (R-E: rows, never bullets).
import { useState, type ReactNode } from 'react'
import { BottomSheet, Button, Icon, ListGroup, ListRow } from '../../../ui'
import { advanceChipLabel, advanceChipName } from '../lib/advanceChip'
import { formatLeadTime } from '../lib/advance'
import { cookStrings } from '../strings'
import type { BaseRecipeLabel } from '../types'
import { BaseRecipeChip } from './BaseRecipeChip'

/** One info line ("Advance Step done: Marinate the chicken", "2 Advance Steps to do"); nothing for an empty text. */
export function AdvanceLine({ text }: { text: string }): ReactNode {
  if (!text) return null
  return (
    <p className="cook-advance-line" data-status="info">
      <Icon name="advanceStep" size={16} />
      <span>{text}</span>
    </p>
  )
}

/** An Advance Step as a row: its text and lead time (or "Done: <text>"), its Base recipe chip, and a "Done" button while pending. */
export interface AdvanceRowItem {
  key: string
  text: string
  done: boolean
  leadTimeMinutes: number
  baseRecipe?: BaseRecipeLabel | null
  onMarkDone: () => void
}

export function AdvanceRows({ label, items }: { label: string; items: AdvanceRowItem[] }): ReactNode {
  return (
    <ListGroup label={label}>
      {items.map((item) =>
        item.done ? (
          <ListRow key={item.key} title={cookStrings.advanceDone(item.text)} icon="success" wrapTitle data-state="done">
            {item.baseRecipe ? <BaseRecipeChip recipe={item.baseRecipe} /> : null}
          </ListRow>
        ) : (
          <ListRow
            key={item.key}
            title={cookStrings.advanceAhead(item.text, formatLeadTime(item.leadTimeMinutes))}
            icon="advanceStep"
            wrapTitle
            data-state="pending"
            actions={
              <Button variant="secondary" size="sm" onClick={item.onMarkDone}>
                {cookStrings.markAdvanceDoneShort}
              </Button>
            }
          >
            {item.baseRecipe ? <BaseRecipeChip recipe={item.baseRecipe} /> : null}
          </ListRow>
        ),
      )}
    </ListGroup>
  )
}

/**
 * Short landscape (SHORT-01): a 40 px info chip "2 Advance Steps to do" (count only between 37.5 em and 48 em; the name stays
 * "Advance Steps: 2 to do") that opens the Advance Steps in a sheet with the one round Close. Nothing when none is left to do.
 */
export function AdvanceChip({ pending, children }: { pending: number; children: ReactNode }): ReactNode {
  const [open, setOpen] = useState(false)
  if (pending <= 0) return null
  return (
    <>
      <button type="button" className="cook-advance-chip" data-status="info" aria-label={advanceChipName(pending)} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Icon name="advanceStep" size={16} />
        <span className="cook-advance-chip__long">{advanceChipLabel(pending)}</span>
        <span className="cook-advance-chip__short" aria-hidden="true">
          {pending}
        </span>
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={cookStrings.advanceHeading}>
        {children}
      </BottomSheet>
    </>
  )
}
