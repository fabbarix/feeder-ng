import { useId, useRef, type ReactElement } from 'react'
import { Button, Chip, Tile, TileHeader } from '../../../ui'
import type { SetupTileActions } from '../hooks/useSetupChecklist'
import { useSetupStepFocus } from '../hooks/useSetupStepFocus'
import type { ZoneRow } from '../lib/currencyGuess'
import { stepsFor, type SetupChecklist } from '../lib/setup'
import { todayStrings as s } from '../strings'
import { SetupStepRow } from './SetupStepRow'
import '../today.css'

export type { SetupTileActions } from '../hooks/useSetupChecklist'

export interface SetupChecklistTileProps {
  checklist: SetupChecklist
  /** Step 1's detected (or picked) time zone and currency. */
  zoneRows: ZoneRow[]
  actions: SetupTileActions
  /** A plain User cannot do the Admin-only steps: they say to ask an Admin, and the Recipes step is theirs. Default true. */
  isAdmin?: boolean
  /** "Looks right" is saving. */
  busy?: boolean
  /** A sheet a step opened is up: a step it completes moves focus on once it closes. */
  sheetOpen?: boolean
}

/**
 * TB-06: "Set up your Household", a soft tile with the tile header (sparkle, the "N of 5" count), a progress bar named "Setup" and five
 * numbered steps as rows: done steps show a tick and their summary, the current step is expanded and holds the only controls, later steps
 * are muted. After the first plan it is compact: one sentence, Add a Recipe and Hide for now. A welcome, never a failure.
 */
export function SetupChecklistTile({ checklist, zoneRows, actions, isAdmin = true, busy = false, sheetOpen = false }: SetupChecklistTileProps): ReactElement | null {
  const titleId = useId()
  const root = useRef<HTMLElement>(null)
  const steps = stepsFor(checklist, isAdmin)
  const focus = useSetupStepFocus(checklist.steps, root, sheetOpen)
  if (!checklist.visible) return null
  const { compact } = checklist
  const pct = checklist.total > 0 ? Math.round((checklist.doneCount / checklist.total) * 100) : 0
  return (
    <Tile
      ref={root}
      as="section"
      variant="soft"
      span={compact ? undefined : 'full'}
      className={compact ? 'setup-tile setup-tile--compact' : 'setup-tile'}
      aria-labelledby={titleId}
    >
      <TileHeader
        icon="why"
        title={s.setupTitle}
        titleId={titleId}
        action={<Chip kind="count">{s.setupCount(checklist.doneCount, checklist.total)}</Chip>}
      />
      <div
        className="setup-progress"
        role="progressbar"
        aria-label={s.setupProgressLabel}
        aria-valuemin={0}
        aria-valuemax={checklist.total}
        aria-valuenow={checklist.doneCount}
      >
        <span style={{ inlineSize: `${pct}%` }} />
      </div>
      {compact ? (
        <>
          <p className="setup-step__sub setup-tile__lead">
            {s.setupCompactText(checklist.recipes.want - checklist.recipes.have, checklist.recipes.have, checklist.recipes.want)}
          </p>
          <div className="setup-step__actions">
            <Button variant="secondary" icon="recipes" onClick={actions.addRecipe}>
              {s.setupAddRecipe}
            </Button>
            {isAdmin ? (
              <Button variant="secondary" onClick={() => void actions.hide()}>
                {s.setupHide}
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <ol className="setup-steps" aria-label={s.setupStepsLabel}>
          {steps.map((step, i) => (
            <SetupStepRow
              key={step.id}
              step={step}
              number={i + 1}
              recipes={checklist.recipes}
              zoneRows={zoneRows}
              actions={actions}
              isAdmin={isAdmin}
              busy={busy}
              onPress={focus.pressed}
            />
          ))}
        </ol>
      )}
      <p className="visually-hidden" role="status" aria-live="polite">
        {focus.announcement}
      </p>
    </Tile>
  )
}
