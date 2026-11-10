import type { ReactElement } from 'react'
import { Button, Chip, Icon, Tile } from '../../../ui'
import type { SetupChecklist, SetupStep } from '../lib/setup'
import { todayStrings as s } from '../strings'
import '../today.css'

export interface SetupChecklistTileProps {
  checklist: SetupChecklist
  onAction: (step: SetupStep) => void
}

/** First run: a welcoming soft tile with the four setup steps; only the current step has a button. Never a failure. */
export function SetupChecklistTile({ checklist, onAction }: SetupChecklistTileProps): ReactElement | null {
  if (!checklist.visible) return null
  return (
    <Tile as="section" variant="soft" span="full" aria-labelledby="today-setup-title">
      <h2 id="today-setup-title" className="today__tile-title">
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
            {step.current ? (
              <Button variant="secondary" size="sm" onClick={() => onAction(step)}>
                {step.action}
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </Tile>
  )
}
