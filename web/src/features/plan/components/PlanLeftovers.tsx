// B5-LOW: the Plan's "Leftovers to use" section: the questions first, then each Leftover with its row menu. Presentational.
import { useId, type ReactNode } from 'react'
import { leftoversToUse, tileRows } from '../../../lib/leftovers/rows'
import type { Leftover } from '../../../lib/leftovers/types'
import type { LeftoverFlow } from '../../../lib/leftovers/useLeftoverFlow'
import { LeftoverItems } from '../../../ui/LeftoverActions/LeftoverItems'
import { planStrings } from '../strings'
import '../plan.css'

export interface PlanLeftoversProps {
  flow: LeftoverFlow
  /** The Leftovers the Planned Meals of this view are served from (left out, but not their questions). */
  servedIds?: Set<number>
}

/** Shows nothing when no Leftover belongs on the list (frozen ones that are not to answer live on the Pantry). */
export function PlanLeftovers({ flow, servedIds = new Set<number>() }: PlanLeftoversProps): ReactNode {
  const titleId = useId()
  const leftovers: Leftover[] = leftoversToUse(flow.leftovers, servedIds)
  if (tileRows(leftovers, flow.today).length === 0) return null
  return (
    <section className="plan-leftovers-section" aria-labelledby={titleId}>
      <h2 id={titleId} className="plan__tile-title">
        {planStrings.leftoversTitle}
      </h2>
      <LeftoverItems
        leftovers={leftovers}
        today={flow.today}
        busy={flow.busy}
        onAction={(kind, leftover) => flow.openSheet(kind, leftover)}
        onAnswer={(leftover, answer) => void flow.answer(leftover, answer)}
      />
    </section>
  )
}
