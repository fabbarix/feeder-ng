import type { ReactNode } from 'react'
import { Button, Dialog, NumberField, Select } from '../../../ui'
import { YIELD_UNITS } from '../../../lib/baseRecipes/yield'
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

/**
 * BR-E (design §3.6, §11.3 answer 4): "Turn Pesto into a Base recipe?" with what the conversion takes away (the dry run) and the Yield.
 * Nothing is saved here: Turn into a Base recipe answers the tile; Cancel, or Escape, goes back to it with nothing chosen.
 */
export function ConvertBaseDialog({ state, canConfirm, onYield, onYieldUnit, onConfirm, onCancel }: ConvertBaseDialogProps): ReactNode {
  if (!state) return null
  return (
    <Dialog
      open
      onClose={onCancel}
      title={s.baseRecipes.convertTitle(state.recipe.name)}
      actions={
        <>
          <Button variant="tertiary" onClick={onCancel}>
            {s.baseRecipes.cancel}
          </Button>
          {state.status === 'ready' ? (
            <Button variant="primary" disabled={!canConfirm} onClick={onConfirm}>
              {s.baseRecipes.convertAction}
            </Button>
          ) : null}
        </>
      }
    >
      {state.status === 'loading' ? <p role="status">{s.baseRecipes.checking}</p> : null}
      {state.status === 'error' ? <p role="alert">{state.error}</p> : null}
      {state.status === 'ready' && state.confirm ? state.confirm.body.map((line, i) => <p key={i}>{line}</p>) : null}
      {state.status !== 'error' ? (
        <>
          <NumberField size="xs" label={s.baseRecipes.yieldLabel} value={state.yield} onChange={onYield} />
          <Select size="xs" label={s.baseRecipes.yieldUnitLabel} options={YIELD_UNITS.map((u) => ({ value: u, label: u }))} value={state.yieldUnit} onChange={onYieldUnit} />
        </>
      ) : null}
    </Dialog>
  )
}
