import type { ReactNode } from 'react'
import { Stepper } from '../../../ui'
import { YieldField } from '../../../ui/fields/YieldField'
import { kindOf } from '../lib/baseRecipe'
import { numberText, numberValue, type DraftErrors, type RecipeDraft } from '../lib/draft'
import { codeMessage, recipeStrings } from '../strings'

export interface RecipeYieldFieldProps {
  draft: RecipeDraft
  errors: DraftErrors
  onChange: (patch: Partial<RecipeDraft>) => void
}

const err = (errors: DraftErrors, key: string) => (errors[key] ? codeMessage(errors[key]) : undefined)

/**
 * RX-02: the Yield in the Ingredients head, said in context: "For one Batch of [– 4 +] portions" (a Recipe), "One pack is [– 2 +]
 * portions" (a Ready Meal), "One Batch makes [800] [g]" (a Base recipe).
 */
export function RecipeYieldField({ draft, errors, onChange }: RecipeYieldFieldProps): ReactNode {
  const f = recipeStrings.fields
  const kind = kindOf(draft)
  if (kind === 'base') {
    return (
      <div className="recipe-yield" data-kind="base">
        <span className="recipe-yield__text">{f.yieldMakes}</span>
        <YieldField
          amount={numberValue(draft.yield)}
          unit={draft.yieldUnit ?? ''}
          amountLabel={f.yield}
          unitLabel={recipeStrings.baseRecipe.yieldUnit}
          amountError={err(errors, 'yield')}
          unitError={err(errors, 'yieldUnit')}
          onAmountChange={(n) => onChange({ yield: numberText(n) })}
          onUnitChange={(yieldUnit) => onChange({ yieldUnit })}
        />
      </div>
    )
  }
  const error = err(errors, 'yield')
  return (
    <div className="recipe-yield" data-kind={kind}>
      <span className="recipe-yield__text">{kind === 'readyMeal' ? f.yieldPack : f.yieldFor}</span>
      <Stepper size="sm" label={f.yield} min={1} max={100} value={numberValue(draft.yield) ?? 1} invalid={Boolean(error)} onChange={(n) => onChange({ yield: numberText(n) })} />
      <span className="recipe-yield__text">{f.yieldPortions}</span>
      {error ? <p className="ui-field__error recipe-yield__error">{error}</p> : null}
    </div>
  )
}
