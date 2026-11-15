import type { ReactElement, ReactNode } from 'react'
import { Button, Icon } from '../../../ui'
import type { SetupTileActions } from '../hooks/useSetupChecklist'
import type { ZoneRow } from '../lib/currencyGuess'
import type { SetupStep, SetupStepId } from '../lib/setup'
import { todayStrings as s } from '../strings'
import { RecipeWays } from './RecipeWays'
import { ZoneStep } from './ZoneStep'

export interface SetupStepRowProps {
  step: SetupStep & { askAdmin: boolean }
  number: number
  recipes: { have: number; want: number }
  zoneRows: ZoneRow[]
  actions: SetupTileActions
  isAdmin: boolean
  busy: boolean
  /** A step's own button was pressed: its completion moves focus on (useSetupStepFocus). */
  onPress: (id: SetupStepId) => void
}

/** One step of the checklist as a row (R-E): its number or a tick, the label, its hint or summary, and on the current step its controls. */
export function SetupStepRow({ step, number, recipes, zoneRows, actions, isAdmin, busy, onPress }: SetupStepRowProps): ReactElement {
  const current = step.state === 'current'
  return (
    <li className="setup-step" data-state={step.state} aria-current={current ? 'step' : undefined}>
      <span className="setup-step__mark" aria-hidden="true">
        {step.done ? <Icon name="tick" size={16} /> : number}
      </span>
      <div className="setup-step__text">
        <span className="setup-step__label">{step.label}</span>
        <span className="setup-step__sub">{step.summary ?? step.hint}</span>
        {step.askAdmin ? <span className="setup-step__ask">{s.setupAskAdmin}</span> : null}
        {step.id === 'zone' && !step.done ? (
          <ZoneStep
            rows={zoneRows}
            canChange={isAdmin && current}
            busy={busy}
            onChange={actions.changeZone}
            onConfirm={
              isAdmin && current
                ? () => {
                    onPress('zone')
                    void actions.confirmZone()
                  }
                : undefined
            }
          />
        ) : null}
        {current ? body(step, recipes, actions, onPress) : null}
      </div>
    </li>
  )
}

/** The current step's controls (step 1 has its own in ZoneStep; the plan is made by the planner and has none). */
function body(step: SetupStep, recipes: { have: number; want: number }, actions: SetupTileActions, onPress: (id: SetupStepId) => void): ReactNode {
  const primary = (icon: 'add' | 'mealSlots', run: () => void) => (
    <div className="setup-step__actions">
      <Button
        icon={icon}
        data-step-primary=""
        onClick={() => {
          onPress(step.id)
          run()
        }}
      >
        {step.action}
      </Button>
    </div>
  )
  switch (step.id) {
    case 'members':
      return primary('add', actions.addMember)
    case 'attendance':
      return primary('mealSlots', actions.setUpMealSlots)
    case 'recipes':
      return <RecipeWays have={recipes.have} want={recipes.want} actions={actions} />
    default:
      return null
  }
}
