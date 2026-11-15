import type { ReactNode } from 'react'
import type { RowState as State } from '../lib/reviewSummary'

/** The state at an Import Review row's end, in body-strong; a question's state is info-toned text, never a chip (R-E). */
export function RowState({ state }: { state: State }): ReactNode {
  return (
    <span className="import-row__state" data-tone={state.tone}>
      {state.text}
    </span>
  )
}
