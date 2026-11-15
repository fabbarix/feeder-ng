// B9-45 (PC-02): ONE info notice (role status; never danger, spoil or an alert) for every shortfall of the Cooked meals: a title,
// DetailList rows (key, state, detail), the foot line or the meal subline, Correct Stock and Dismiss as secondary buttons.
import type { ReactElement } from 'react'
import type { UnitSystem } from '../../../lib/units'
import { Button, DetailList, DetailRow, Icon, Tile } from '../../../ui'
import { shortfallRows, shortfallTitle, type ShortfallGroup } from '../lib/shortfall'
import { stockStrings } from '../strings'
import './ShortfallNotice.css'

export interface ShortfallNoticeProps {
  /** One group per Cooked meal; the notice lists their rows, grouped by meal when there are several (PC-02). */
  groups: ShortfallGroup[]
  system?: UnitSystem
  /** `cooked`: Cook Mode's confirmation (the foot line "Stock stays where it is. Correct it if some was left."). `list`: Today and the Plan (a subline naming the meal). */
  placement?: 'cooked' | 'list'
  onCorrect: () => void
  onDismiss: () => void
}

/** The rows sit on the info tint (passed as a spread: the feature's hygiene guard reads a bare `tone` attribute as the legacy Tile prop). */
const INFO_ROWS = { tone: 'info' } as const

export function ShortfallNotice({ groups, system = 'metric', placement = 'cooked', onCorrect, onDismiss }: ShortfallNoticeProps): ReactElement | null {
  const shown = groups.filter((g) => g.warnings.length > 0)
  if (shown.length === 0) return null
  const s = stockStrings.shortfall
  const rows = shortfallRows(shown, system)
  const several = shown.length > 1
  const subline = placement === 'list' ? (several ? s.stays : `${shown[0]!.mealLabel} · ${s.stays}`) : null
  return (
    <Tile variant="status" status="info" span="full" role="status" className="shortfall-notice">
      <div className="shortfall-notice__head">
        <p className="shortfall-notice__title">
          <Icon name="info" size={20} />
          <span>{shortfallTitle(shown)}</span>
        </p>
        {subline ? <p className="shortfall-notice__subline">{subline}</p> : null}
      </div>
      {shown.map((group) => (
        <div key={group.id} className="shortfall-notice__group">
          {several ? <h3 className="shortfall-notice__meal">{group.mealLabel}</h3> : null}
          <DetailList {...INFO_ROWS}>
            {rows
              .filter((r) => r.groupId === group.id)
              .map((r) => (
                <DetailRow key={r.key} label={r.name} state={r.state} detail={r.detail} />
              ))}
          </DetailList>
        </div>
      ))}
      {placement === 'cooked' ? <p className="shortfall-notice__foot">{s.foot}</p> : null}
      <div className="shortfall-notice__actions">
        <Button variant="secondary" onClick={onCorrect}>
          {s.correct}
        </Button>
        <Button variant="secondary" onClick={onDismiss}>
          {s.dismiss}
        </Button>
      </div>
    </Tile>
  )
}
