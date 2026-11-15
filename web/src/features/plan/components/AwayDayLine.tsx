import type { ReactNode } from 'react'
import { Icon } from '../../../ui'
import type { AwayDayLineView } from '../hooks/useAwayDay'
import type { Away } from '../types'

/** B9-46 (PC-08): a whole-day Away under a day's name, "Ben away all day · 1.75 portions": a 44 px button that opens that Away. */
export function AwayDayLine({ line, onAway }: { line: AwayDayLineView; onAway?: (away: Away) => void }): ReactNode {
  return (
    <button type="button" className="plan-day__away" aria-label={line.name} aria-haspopup="dialog" disabled={!onAway} onClick={() => onAway?.(line.away)}>
      <Icon name="attendance" size={16} />
      <span className="plan-day__away-text">{line.text}</span>
    </button>
  )
}
