import { useId, useState, type ReactElement } from 'react'
import { Button, Tile, TileHeader, TileRow, TileRows } from '../../../ui'
import { useRowFocusAfterRemoval } from '../../plan'
import { badgeFor, doneName, metaFor, splitShown, stepKey } from '../lib/advanceSteps'
import { todayStrings as s } from '../strings'
import type { StepLanding } from '../lib/landing'
import type { AdvanceStepDue } from '../types'
import '../today.css'

export interface AdvanceStepsTileProps {
  steps: AdvanceStepDue[]
  /** The Household date (YYYY-MM-DD) and zone: the When badge says Today or the due day in it. */
  today: string
  timeZone: string
  /** Done on a row: the screen writes the mark and shows the toast with Undo. */
  onDone: (step: AdvanceStepDue) => void
  /** Offline, Done is disabled with the title "Needs a connection" (RES). */
  offline?: boolean
  /** B9-49 (TB-14): the Step a notification landed on, ringed while it lasts (useTodayLanding); its row is shown even past the first four. */
  ringed?: StepLanding | null
}

/** The header badge's tone, spread (a hygiene check reads a tone attribute on a Tile-named element as the legacy prop). */
const INFO_BADGE = { tone: 'info' } as const

/**
 * B9-44 (TB-02, TB-09, DS 3): "Advance Steps", an info status tile with the shared header (an alarm badge, the title, a count). One row per
 * not-done Step due in the next 24 h, soonest first, in the To confirm anatomy: the When badge ("Today" / "Tue" / "Overdue" over the due
 * time; solid info when overdue), the Step text, the meta "For Tue Dinner · Recipe" and Done (secondary). The first four rows, then
 * "Show N more". When a row goes after Done, focus moves to the next row's Done, else the previous one's. Renders nothing for no Steps.
 */
export function AdvanceStepsTile({ steps, today, timeZone, onDone, offline = false, ringed = null }: AdvanceStepsTileProps): ReactElement | null {
  const titleId = useId()
  const [expanded, setExpanded] = useState(false)
  const focus = useRowFocusAfterRemoval(steps.map(stepKey))
  if (steps.length === 0) return null
  const { rows, more } = splitShown(steps)
  const ringedKey = ringed ? `${ringed.scope}:${ringed.index}` : null
  const shown = expanded || (ringedKey !== null && !rows.some((r) => stepKey(r) === ringedKey)) ? steps : rows
  return (
    <Tile as="section" variant="status" status="info" aria-labelledby={titleId} className="advance-steps">
      <TileHeader icon="advanceStep" {...INFO_BADGE} title={s.advanceStepsHeading} titleId={titleId} count={steps.length} countLabel={s.countItems(steps.length)} />
      <TileRows className="advance-steps__list" onFocus={focus.onFocus}>
        {shown.map((step) => {
          const badge = badgeFor(step, today, timeZone)
          return (
            <TileRow key={stepKey(step)} className="advance-step" data-row-focus-key={stepKey(step)} data-landing={stepKey(step) === ringedKey ? 'true' : undefined}>
              <p className="advance-step__when" data-overdue={badge.overdue ? 'true' : undefined}>
                <span>{badge.top}</span>
                <span>{badge.bottom}</span>
              </p>
              <div className="advance-step__text">
                <p className="advance-step__title">{step.description}</p>
                <p className="advance-step__meta">{metaFor(step)}</p>
              </div>
              <div className="advance-step__done">
                <Button
                  variant="secondary"
                  size="md"
                  icon="confirm"
                  aria-label={doneName(step, steps)}
                  disabled={offline}
                  title={offline ? s.needsConnection : undefined}
                  onClick={() => onDone(step)}
                >
                  {s.advanceDone}
                </Button>
              </div>
            </TileRow>
          )
        })}
      </TileRows>
      {more > 0 ? (
        <Button variant="secondary" size="sm" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? s.advanceShowFewer : s.advanceShowMore(more)}
        </Button>
      ) : null}
    </Tile>
  )
}

/** B9-49 (TB-14): after a landing, scroll the Step's row into view and focus its Done (once the row has rendered). */
export function focusAdvanceStepDone(scope: string, index: number): void {
  const key = `${scope}:${index}`
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const row = [...document.querySelectorAll<HTMLElement>('.advance-step[data-row-focus-key]')].find((el) => el.dataset.rowFocusKey === key)
      const done = row?.querySelector<HTMLButtonElement>('.advance-step__done button')
      done?.scrollIntoView?.({ block: 'center' })
      done?.focus()
    }),
  )
}
