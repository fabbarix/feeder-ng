import type { ReactNode } from 'react'
import { Button, Dialog } from '../../../ui'
import { YieldField } from '../../../ui/fields/YieldField'
import { convertConfirm } from '../../../lib/baseRecipes/convertConfirm'
import type { ConvertState } from '../hooks/useBaseRecipeLines'
import { importStrings as s } from '../strings'

export interface ConvertBaseDialogProps {
  /** null = closed. */
  state: ConvertState | null
  /** The Yield is a number above 0 and the dry run is in. */
  canConfirm: boolean
  onYield: (value: number | null) => void
  onYieldUnit: (unit: string) => void
  onConfirm: () => void
  onCancel: () => void
}

/** Stands in for the dry run while it is asked: the title and the label do not depend on it. */
const NO_CHANGES = { plannedMeals: [], slotRules: [], leftovers: 0, preferences: 0 }

/**
 * BR-E (design §3.6, §11.3 answer 4): "Turn Pesto into a Base recipe?" with what the conversion takes away (the dry run) and the Yield. The
 * title and the confirm label are BR-D's convertConfirm. Nothing is saved here: Turn into a Base recipe answers the tile; Cancel, or Escape,
 * goes back to it with nothing chosen.
 */
export function ConvertBaseDialog({ state, canConfirm, onYield, onYieldUnit, onConfirm, onCancel }: ConvertBaseDialogProps): ReactNode {
  if (!state) return null
  const copy = convertConfirm(state.recipe.name, NO_CHANGES)
  return (
    <Dialog
      open
      onClose={onCancel}
      title={copy.title}
      actions={
        <>
          <Button variant="tertiary" onClick={onCancel}>
            {s.baseRecipes.cancel}
          </Button>
          {state.status === 'ready' ? (
            <Button variant="primary" disabled={!canConfirm} onClick={onConfirm}>
              {copy.confirmLabel}
            </Button>
          ) : null}
        </>
      }
    >
      {state.status === 'loading' ? <p role="status">{s.baseRecipes.checking}</p> : null}
      {state.status === 'error' ? <p role="alert">{state.error}</p> : null}
      {state.status === 'ready' && state.confirm ? state.confirm.body.map((line, i) => <p key={i}>{line}</p>) : null}
      {state.status !== 'error' ? (
        <div className="base-yield">
          <YieldField amount={state.yield} unit={state.yieldUnit} onAmountChange={onYield} onUnitChange={onYieldUnit} />
        </div>
      ) : null}
    </Dialog>
  )
}
