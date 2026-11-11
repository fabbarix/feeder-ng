import type { ReactElement } from 'react'
import { Button, Chip, Icon, Tile } from '../../../ui'
import type { SetupChecklist, SetupStep } from '../lib/setup'
import { todayStrings as s } from '../strings'
import '../today.css'

export interface SetupChecklistTileProps {
  checklist: SetupChecklist
  onAction: (step: SetupStep) => void
  /** A plain User cannot change Members or Meal Slots: those steps say to ask an Admin. Default true. */
  isAdmin?: boolean
}

/** First run: a welcoming soft tile with the four setup steps; only the current step has a button. Never a failure. */
export function SetupChecklistTile({ checklist, onAction, isAdmin = true }: SetupChecklistTileProps): ReactElement | null {
  if (!checklist.visible) return null
  // The button goes to the first open step this User can act on (a plain User cannot change Members or Meal Slots).
  const actionableId = checklist.steps.find((x) => !x.done && (isAdmin || !x.adminOnly))?.id
  return (
    <Tile as="section" variant="soft" span="full" aria-labelledby="today-setup-title">
      <h2 id="today-setup-title" className="today__tile-title today__setup-title">
        {s.setupTitle}
      </h2>
      <p className="today__muted">{s.setupProgress(checklist.doneCount, checklist.total)}</p>
      <ol className="today__list today__setup" aria-label={s.setupStepsLabel}>
        {checklist.steps.map((step) => (
          <li key={step.id} className="today__setup-step" data-done={step.done ? 'true' : 'false'} aria-current={step.current ? 'step' : undefined}>
            <Icon name={step.icon} size={20} />
            <div className="today__step">
              <span className="today__row">{step.label}</span>
              <span className="today__muted">{step.hint}</span>
            </div>
            {step.done ? <Chip kind="status" status="success">{s.setupDone}</Chip> : null}
            {step.current && step.adminOnly && !isAdmin ? <span className="today__muted">{s.setupAskAdmin}</span> : null}
            {step.id === actionableId ? (
              <Button variant="secondary" size="sm" className="today__setup-action" onClick={() => onAction(step)}>
                {step.action}
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </Tile>
  )
}
