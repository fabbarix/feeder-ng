// B5-LOW: the Plan's "Leftovers to use" section: the questions first, then each Leftover with its row menu. Presentational.
import { useId, type ReactNode } from 'react'
import { tileRows } from '../../../lib/leftovers/rows'
import type { LeftoverFlow } from '../../../lib/leftovers/useLeftoverFlow'
import { LeftoverItems } from '../../../ui/LeftoverActions/LeftoverItems'
import { planStrings } from '../strings'
import '../plan.css'

export interface PlanLeftoversProps {
  flow: LeftoverFlow
}

/** Shows nothing when no Leftover belongs on the list (frozen ones that are not to answer live on the Pantry). */
export function PlanLeftovers({ flow }: PlanLeftoversProps): ReactNode {
  const titleId = useId()
  if (tileRows(flow.leftovers, flow.today).length === 0) return null
  return (
    <section className="plan-leftovers-section" aria-labelledby={titleId}>
      <h2 id={titleId} className="plan__tile-title">
        {planStrings.leftoversTitle}
      </h2>
      <LeftoverItems
        leftovers={flow.leftovers}
        today={flow.today}
        busy={flow.busy}
        onAction={(kind, leftover) => flow.openSheet(kind, leftover)}
        onAnswer={(leftover, answer) => void flow.answer(leftover, answer)}
      />
    </section>
  )
}
