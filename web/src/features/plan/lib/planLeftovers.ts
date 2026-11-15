// B9-32 (PC-07, PLAN-19): "Leftovers to use" on the Plan below 1024 px is one summary row. Plain TypeScript, no React.
import { weekdayShort } from '../../../lib/leftovers/dates'
import { tileRows } from '../../../lib/leftovers/rows'
import type { Leftover } from '../../../lib/leftovers'
import { planStrings as s } from '../strings'

export interface LeftoverSummary {
  /** The questions waiting for an answer: never folded into the summary. */
  questions: Leftover[]
  /** "3 Leftovers"; null when only questions are left. */
  title: string | null
  /** "Cauliflower al gorgonzola, Slow cooker beef · first Use by Tue". */
  meta: string
  /** "Show 3 Leftovers". */
  showLabel: string
}

/** The rows the tile would list (tileRows), split into the questions it keeps and the summary of the rest (soonest Use-by first). */
export function leftoverSummary(leftovers: Leftover[], today: string): LeftoverSummary {
  const byId = new Map(leftovers.map((l) => [l.id, l]))
  const rows = tileRows(leftovers, today)
  const questions = rows.filter((r) => r.kind === 'question').map((r) => byId.get(r.id)!)
  const rest = rows.filter((r) => r.kind !== 'question').map((r) => byId.get(r.id)!)
  if (rest.length === 0) return { questions, title: null, meta: '', showLabel: '' }
  const names = rest.map((l) => l.recipeName).join(', ')
  return {
    questions,
    title: s.leftoverCount(rest.length),
    meta: `${names} · ${s.firstUseBy(weekdayShort(rest[0]!.useBy))}`,
    showLabel: s.showLeftovers(rest.length),
  }
}
