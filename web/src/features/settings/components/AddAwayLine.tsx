import type { ReactNode } from 'react'
import { Button } from '../../../ui'
import { awayStrings } from '../../plan/strings/away'

const s = awayStrings.away

/** B9-46 (PC-08): in Who's eating, "Someone away for more days?" and the outlined "Add an Away" (it opens the Away sheet instead). */
export function AddAwayLine({ onAddAway }: { onAddAway: () => void }): ReactNode {
  return (
    <div className="attendance-add-away">
      <span className="attendance-add-away__text">{s.moreDays}</span>
      <Button variant="secondary" icon="add" onClick={onAddAway}>
        {s.addAway}
      </Button>
    </div>
  )
}
