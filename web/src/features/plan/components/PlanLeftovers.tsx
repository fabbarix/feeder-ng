// B9-32 (PC-07, PLAN-19): the Plan's "Leftovers to use": the bordered leftover tile, as on Today. From 1024 px it lists its
// rows (questions first, then each Leftover with its row menu); below, the questions and one summary row with Show, which
// opens the same rows in a sheet. Presentational: the summary is lib/planLeftovers.
import { useId, useState, type ReactNode } from 'react'
import { BottomSheet, Button, Icon, Tile } from '../../../ui'
import { tileRows } from '../../../lib/leftovers/rows'
import type { LeftoverFlow } from '../../../lib/leftovers/useLeftoverFlow'
import { LeftoverItems } from '../../../ui/LeftoverActions/LeftoverItems'
import { useBreakpoint } from '../../../ui/lib/breakpoints'
import { leftoverSummary } from '../lib/planLeftovers'
import { planStrings } from '../strings'
import '../plan.css'

export interface PlanLeftoversProps {
  flow: LeftoverFlow
}

/** Shows nothing when no Leftover belongs on the list (frozen ones that are not to answer live on the Pantry). */
export function PlanLeftovers({ flow }: PlanLeftoversProps): ReactNode {
  const wide = useBreakpoint('desktop')
  const titleId = useId()
  const [sheetOpen, setSheetOpen] = useState(false)
  if (tileRows(flow.leftovers, flow.today).length === 0) return null
  const items = (leftovers: typeof flow.leftovers) => (
    <LeftoverItems
      leftovers={leftovers}
      today={flow.today}
      busy={flow.busy}
      plannedFor={flow.plannedFor}
      onAction={(kind, leftover) => {
        setSheetOpen(false)
        flow.openSheet(kind, leftover)
      }}
      onAnswer={(leftover, answer) => void flow.answer(leftover, answer)}
    />
  )
  const summary = wide ? null : leftoverSummary(flow.leftovers, flow.today)
  return (
    <Tile
      as="section"
      variant="status"
      status="leftover"
      aria-labelledby={titleId}
      className="plan-leftovers"
    >
      {/* PC-07 mock: the tile's heading IS its overline ("LEFTOVERS TO USE"); no second title line repeats it. */}
      <h2 id={titleId} className="tile__overline">
        <Icon name="leftover" size={16} />
        {planStrings.leftoversTitle}
      </h2>
      {summary === null ? (
        <div className="plan-leftovers__rows">{items(flow.leftovers)}</div>
      ) : (
        <>
          {summary.questions.length > 0 ? <div className="plan-leftovers__rows">{items(summary.questions)}</div> : null}
          {summary.title ? (
            <div className="plan-leftovers__summary">
              <p className="plan-leftovers__summary-text">
                <span className="plan-leftovers__summary-title">{summary.title}</span>
                {/* The names may end in an ellipsis; "first Use by Tue", the point of the line, is never cut. */}
                <span className="plan-leftovers__summary-meta" title={summary.meta}>
                  <span className="plan-leftovers__summary-names">{summary.names}</span>
                  <span className="plan-leftovers__summary-useby">{` · ${summary.useBy}`}</span>
                </span>
              </p>
              <Button variant="secondary" size="sm" aria-label={summary.showLabel} onClick={() => setSheetOpen(true)}>
                {planStrings.leftoverSummary.show}
              </Button>
            </div>
          ) : null}
          <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={planStrings.leftoversTitle}>
            <div className="plan-leftovers__rows">{items(flow.leftovers)}</div>
          </BottomSheet>
        </>
      )}
    </Tile>
  )
}
