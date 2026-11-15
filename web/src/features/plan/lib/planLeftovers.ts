// B9-32 (PC-07, PLAN-19): "Leftovers to use" on the Plan below 1024 px is one summary row. Plain TypeScript, no React.
// B9-55: a question waiting for an answer is counted on that row ("3 Leftovers · 1 to answer") and asked in the sheet, as the PC-07
// mock draws one summary row: asked inline, its three answers pushed the week below the first viewport at 375 x 667.
import { weekdayShort } from '../../../lib/leftovers/dates'
import { tileRows } from '../../../lib/leftovers/rows'
import type { Leftover } from '../../../lib/leftovers'
import { planStrings as s } from '../strings'

export interface LeftoverSummary {
  /** The questions waiting for an answer: counted in the title, asked first in the sheet. */
  questions: Leftover[]
  /** "3 Leftovers", "3 Leftovers · 1 to answer"; null when there is nothing to list. */
  title: string | null
  /** "Cauliflower al gorgonzola, Slow cooker beef · first Use by Tue". */
  meta: string
  /** The meta in two parts: the names (which may be cut) and "first Use by Tue" (which never is). */
  names: string
  useBy: string
  /** "Show 3 Leftovers". */
  showLabel: string
}

/** The rows the tile would list (tileRows), split into the questions it keeps and the summary of the rest (soonest Use-by first). */
export function leftoverSummary(leftovers: Leftover[], today: string): LeftoverSummary {
  const byId = new Map(leftovers.map((l) => [l.id, l]))
  const rows = tileRows(leftovers, today)
  const questions = rows.filter((r) => r.kind === 'question').map((r) => byId.get(r.id)!)
  const rest = rows.filter((r) => r.kind !== 'question').map((r) => byId.get(r.id)!)
  const all = [...questions, ...rest]
  if (all.length === 0) return { questions, title: null, meta: '', names: '', useBy: '', showLabel: '' }
  const names = all.map((l) => l.recipeName).join(', ')
  const useBy = rest.length > 0 ? s.leftoverSummary.firstUseBy(weekdayShort(rest[0]!.useBy)) : s.leftoverSummary.toAnswer(questions.length)
  const count = s.leftoverSummary.count(all.length)
  return {
    questions,
    title: questions.length > 0 && rest.length > 0 ? `${count} · ${s.leftoverSummary.toAnswer(questions.length)}` : count,
    meta: `${names} · ${useBy}`,
    names,
    useBy,
    showLabel: s.leftoverSummary.showLabel(all.length),
  }
}
