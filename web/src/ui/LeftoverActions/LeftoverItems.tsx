// The Leftovers of a list (Today's tile, the Plan's section): questions first, then the rows, in the order tileRows gives.
import { tileRows } from '../../lib/leftovers/rows'
import type { Leftover, LeftoverActionKind, LeftoverAnswer } from '../../lib/leftovers'
import { LeftoverQuestion } from './LeftoverQuestion'
import { LeftoverRow } from './LeftoverRow'

export interface LeftoverItemsProps {
  leftovers: Leftover[]
  today: string
  busy?: boolean
  onAction: (kind: LeftoverActionKind, leftover: Leftover) => void
  onAnswer: (leftover: Leftover, answer: LeftoverAnswer) => void
}

/** Renders each Leftover that belongs on the list: a question while it waits for an answer, else its row with the row Menu. */
export function LeftoverItems({ leftovers, today, busy = false, onAction, onAnswer }: LeftoverItemsProps) {
  const byId = new Map(leftovers.map((l) => [l.id, l]))
  return (
    <>
      {tileRows(leftovers, today).map((row) => {
        const leftover = byId.get(row.id)!
        return row.kind === 'question' ? (
          <LeftoverQuestion key={row.id} leftover={leftover} today={today} busy={busy} onAnswer={(answer, l) => onAnswer(l, answer)} />
        ) : (
          <LeftoverRow key={row.id} leftover={leftover} today={today} onAction={onAction} />
        )
      })}
    </>
  )
}
