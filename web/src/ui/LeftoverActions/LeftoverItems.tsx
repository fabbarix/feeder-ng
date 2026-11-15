// The Leftovers of a list (Today's tile, the Plan's section): questions first, then the rows, in the order tileRows gives.
import { mergeRows, tileRows } from '../../lib/leftovers/rows'
import type { Leftover, LeftoverActionKind, LeftoverAnswer } from '../../lib/leftovers'
import { LeftoverQuestion } from './LeftoverQuestion'
import { LeftoverRow } from './LeftoverRow'

export interface LeftoverItemsProps {
  leftovers: Leftover[]
  today: string
  busy?: boolean
  /** B9-45 (PC-13): the Planned Meals that need portions of a Leftover, by Leftover id ("Mon Dinner"); the row's second meta line (lib/leftovers spareHint). */
  plannedFor?: Record<number, string[]>
  onAction: (kind: LeftoverActionKind, leftover: Leftover) => void
  onAnswer: (leftover: Leftover, answer: LeftoverAnswer) => void
  /**
   * B9-44 (TB-11): pressing a row opens its Leftover's actions (Today's tile): rows have no row Menu, and every item is an `li` (a question
   * is wrapped in one), so the caller puts them in a `ul`.
   */
  onPress?: (leftover: Leftover) => void
}

/** Renders each Leftover that belongs on the list: a question while it waits for an answer, else its row with the row Menu. */
/**
 * B9-45 (PC-13, decision PC 7): Leftovers of one Recipe with the same Use-by are ONE row (lib/leftovers mergeRows): its actions are
 * reported for the merged Leftover (every id, the portions summed; the flow takes from the soonest first), and a Leftover that is
 * planned for says how much a meal takes and how much is spare on a second meta line.
 */
export function LeftoverItems({ leftovers, today, busy = false, plannedFor = {}, onAction, onAnswer, onPress }: LeftoverItemsProps) {
  const byId = new Map(leftovers.map((l) => [l.id, l]))
  const merged = new Map(mergeRows(leftovers).map((l) => [l.id, l]))
  return (
    <>
      {tileRows(leftovers, today, plannedFor).map((row) => {
        const leftover = byId.get(row.id)!
        if (row.kind === 'question') {
          const question = <LeftoverQuestion key={row.id} leftover={leftover} today={today} busy={busy} onAnswer={(answer, l) => onAnswer(l, answer)} />
          return onPress ? (
            <li key={row.id} className="leftover-items__question">
              {question}
            </li>
          ) : (
            question
          )
        }
        return <LeftoverRow key={row.id} leftover={merged.get(row.id) ?? leftover} today={today} hint={row.hint} onAction={onAction} onPress={onPress} />
      })}
    </>
  )
}
