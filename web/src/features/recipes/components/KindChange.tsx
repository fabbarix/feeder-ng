import { useEffect, useState, type ReactNode } from 'react'
import { useBaseRecipeChange } from '../hooks/useBaseRecipeChange'
import { TakeOverDialog } from './TakeOverDialog'

export interface KindChangeProps {
  recipeId: number | undefined
  /** true: the Recipe becomes a Base recipe; false: it becomes plannable again. */
  on: boolean
  name: string
  /** The Yield as a number (a Base recipe's amount, or a plannable Recipe's portions). */
  yieldValue: number
  yieldUnit: string
  /** The outcome, and the words of a refusal (read after the change settled). */
  onResult: (outcome: 'done' | 'cancelled' | 'failed', message: string | null) => void
}

/**
 * BR-D round 3: the Base recipe switch applies on Save. Mounted only for the Save of a changed kind (its hook needs the Confirm provider): it asks
 * (the P6 confirm, or nothing for a new Recipe) and reports; the screen then saves or stops. Round 4: a name that is an Ingredient's asks the
 * take-over question first (TakeOverDialog), and the report waits for the answer.
 */
export function KindChange({ recipeId, on, name, yieldValue, yieldUnit, onResult }: KindChangeProps): ReactNode {
  const change = useBaseRecipeChange({ recipeId })
  const [outcome, setOutcome] = useState<'done' | 'cancelled' | 'failed' | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const result = on
        ? await change.turnOn({ name, yield: yieldValue, yieldUnit })
        : await change.turnOff({ name, yield: yieldValue })
      if (alive) setOutcome(result)
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one change per Save
  }, [])

  useEffect(() => {
    if (outcome !== null) onResult(outcome, change.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report once when settled
  }, [outcome])

  return (
    <TakeOverDialog
      ask={change.takeOverAsk}
      baseName={name}
      onAnswer={(yes) => void change.answerTakeOver(yes)}
      onCancel={change.cancelTakeOver}
    />
  )
}
