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
}

/** Renders each Leftover that belongs on the list: a question while it waits for an answer, else its row with the row Menu. */
/**
 * B9-45 (PC-13, decision PC 7): Leftovers of one Recipe with the same Use-by are ONE row (lib/leftovers mergeRows): its actions are
 * reported for the merged Leftover (every id, the portions summed; the flow takes from the soonest first), and a Leftover that is
 * planned for says how much a meal takes and how much is spare on a second meta line.
 */
export function LeftoverItems({ leftovers, today, busy = false, plannedFor = {}, onAction, onAnswer }: LeftoverItemsProps) {
  const byId = new Map(leftovers.map((l) => [l.id, l]))
  const merged = new Map(mergeRows(leftovers).map((l) => [l.id, l]))
  const rows = tileRows(leftovers, today, plannedFor)
  // P38: two rows of one Recipe (another Use-by, or frozen) get Menus whose names say which row they are
  const perRecipe = new Map<string, number>()
  for (const row of rows) if (row.kind !== 'question') {
    const name = byId.get(row.id)!.recipeName
    perRecipe.set(name, (perRecipe.get(name) ?? 0) + 1)
  }
  return (
    <>
      {rows.map((row) => {
        const leftover = byId.get(row.id)!
        return row.kind === 'question' ? (
          <LeftoverQuestion key={row.id} leftover={leftover} today={today} busy={busy} onAnswer={(answer, l) => onAnswer(l, answer)} />
        ) : (
          <LeftoverRow key={row.id} leftover={merged.get(row.id) ?? leftover} today={today} hint={row.hint} distinguish={(perRecipe.get(leftover.recipeName) ?? 0) > 1} onAction={onAction} />
        )
      })}
    </>
  )
}
